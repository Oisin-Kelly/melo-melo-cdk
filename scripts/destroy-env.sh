#!/bin/bash
# Tear down a whole environment — every stack AND everything the stacks leave behind:
#   - resources kept by RemovalPolicy.RETAIN (prod keeps all of them: the DynamoDB table
#     and its data, the S3 buckets and their files, the Cognito user pool and its users,
#     Lambdas, layers, the HTTP API, the state machine)
#   - the Lambdas' CloudWatch log groups (/aws/lambda/…), which Lambda creates on first
#     invoke outside any stack, so `cdk destroy` never removes them
# Afterwards a fresh deploy of the same environment works (no "already exists" clashes).
# Shared, non-stack things are left alone: the ACM certificate, the Route 53 hosted zone,
# the SES domain identity and the CDK bootstrap stack.
#
# Usage: ENVIRONMENT=prod ./scripts/destroy-env.sh           # dry run: lists what would be deleted
#        ENVIRONMENT=prod ./scripts/destroy-env.sh --apply   # deletes (asks you to type the env name)
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
APPLY=0
if [ "${1:-}" = "--apply" ]; then APPLY=1; fi

# Deletion order: importers before the stacks they import from — CloudFormation refuses to
# delete a stack whose exports are still in use. api imports lambda + auth; auth imports
# lambda (its triggers); lambda imports sfn (the state machine ARN); sfn and lambda import
# storage + data.
STACKS="web-stack-$ENVIRONMENT api-stack-$ENVIRONMENT auth-stack-$ENVIRONMENT lambda-stack-$ENVIRONMENT sfn-stack-$ENVIRONMENT storage-stack-$ENVIRONMENT data-stack-$ENVIRONMENT"

INVENTORY=$(mktemp)
trap 'rm -f "$INVENTORY"' EXIT

# 1. Inventory, taken before anything is deleted (a deleted stack can't be listed):
#    "Type<TAB>PhysicalId" for every resource of every stack that exists
existing=""
for stack in $STACKS; do
  if aws cloudformation describe-stacks --stack-name "$stack" >/dev/null 2>&1; then
    existing="$existing $stack"
    aws cloudformation list-stack-resources --stack-name "$stack" \
      --query "StackResourceSummaries[].[ResourceType,PhysicalResourceId]" --output text >>"$INVENTORY"
  fi
done

# Lambda log groups: one per function in the inventory, plus a sweep by stack-name prefix
# (CDK-generated function names start with the stack name) for any from earlier deploys
loggroups=$(
  {
    awk -F'\t' '$1 == "AWS::Lambda::Function" { print "/aws/lambda/" $2 }' "$INVENTORY"
    for stack in $STACKS; do
      aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/$stack-" \
        --query "logGroups[].logGroupName" --output text | tr '\t' '\n'
    done
  } | grep -v '^$' | grep -v '^None$' | sort -u || true
)

echo "Environment: $ENVIRONMENT"
echo "Stacks to delete:${existing:- (none deployed)}"
echo
echo "Resources (deleted with their stack, or by this script if retained):"
if [ -s "$INVENTORY" ]; then
  awk -F'\t' '{ printf "  %-36s %s\n", $1, $2 }' "$INVENTORY" | sort
else
  echo "  (none)"
fi
echo
echo "Log groups:"
if [ -n "$loggroups" ]; then echo "$loggroups" | sed 's/^/  /'; else echo "  (none)"; fi

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "Dry run — nothing deleted. Re-run with --apply to delete all of the above."
  exit 0
fi

echo
printf 'This permanently deletes ALL %s data, files, users and logs. Type "%s" to continue: ' "$ENVIRONMENT" "$ENVIRONMENT"
read -r answer
if [ "$answer" != "$ENVIRONMENT" ]; then
  echo "Aborted."
  exit 1
fi

# 2. Delete the stacks, in order, each fully gone before the next
for stack in $existing; do
  echo "Deleting stack ${stack}…"
  aws cloudformation delete-stack --stack-name "$stack"
  aws cloudformation wait stack-delete-complete --stack-name "$stack"
done

# 3. Delete whatever the stacks retained. Each delete tolerates "already gone". The loops
#    read from fd 3 so the aws CLI (which can read stdin) never swallows their input.
gone() { echo "  $1 (already gone)"; }
while IFS=$'\t' read -r type id <&3; do
  [ -z "$type" ] && continue
  case "$type" in
    AWS::DynamoDB::Table)
      echo "Table $id"
      aws dynamodb delete-table --table-name "$id" >/dev/null 2>&1 &&
        aws dynamodb wait table-not-exists --table-name "$id" || gone "$id" ;;
    AWS::S3::Bucket)
      echo "Bucket $id"
      if aws s3api head-bucket --bucket "$id" >/dev/null 2>&1; then
        aws s3 rm "s3://$id" --recursive --only-show-errors
        aws s3api delete-bucket --bucket "$id"
      else gone "$id"; fi ;;
    AWS::Cognito::UserPool)
      echo "User pool $id"
      aws cognito-idp delete-user-pool --user-pool-id "$id" 2>/dev/null || gone "$id" ;;
    AWS::Lambda::Function)
      echo "Function $id"
      aws lambda delete-function --function-name "$id" 2>/dev/null || gone "$id" ;;
    AWS::Lambda::LayerVersion)
      # Physical id is the version ARN: arn:aws:lambda:region:acct:layer:NAME:VERSION
      name=$(echo "$id" | cut -d: -f7)
      version=$(echo "$id" | cut -d: -f8)
      echo "Layer $name:$version"
      aws lambda delete-layer-version --layer-name "$name" --version-number "$version" 2>/dev/null || gone "$id" ;;
    AWS::ApiGatewayV2::Api)
      echo "HTTP API $id"
      aws apigatewayv2 delete-api --api-id "$id" 2>/dev/null || gone "$id" ;;
    AWS::StepFunctions::StateMachine)
      echo "State machine $id"
      aws stepfunctions delete-state-machine --state-machine-arn "$id" 2>/dev/null || gone "$id" ;;
    AWS::Logs::LogGroup)
      echo "Log group $id"
      aws logs delete-log-group --log-group-name "$id" 2>/dev/null || gone "$id" ;;
  esac
done 3<"$INVENTORY"

# 4. The Lambda log groups
if [ -n "$loggroups" ]; then
  while IFS= read -r group <&3; do
    echo "Log group $group"
    aws logs delete-log-group --log-group-name "$group" 2>/dev/null || gone "$group"
  done 3<<<"$loggroups"
fi

echo
echo "Done: $ENVIRONMENT is fully torn down."
