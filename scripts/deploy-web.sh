#!/bin/bash
# Builds the web app against the deployed backend's stack outputs, then deploys web-stack.
# Usage: ENVIRONMENT=dev ./scripts/deploy-web.sh   (ENVIRONMENT defaults to dev)
set -euo pipefail
cd "$(dirname "$0")/.."

ENVIRONMENT="${ENVIRONMENT:-dev}"
REGION="${AWS_REGION:-eu-west-1}"

api_url=$(aws cloudformation describe-stacks --stack-name "api-stack-$ENVIRONMENT" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" --output text | sed 's:/*$::')
client_id=$(aws cloudformation describe-stacks --stack-name "auth-stack-$ENVIRONMENT" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)

if [ -z "$api_url" ] || [ -z "$client_id" ]; then
  echo "Could not read stack outputs for $ENVIRONMENT — is the backend deployed?" >&2
  exit 1
fi

cat > web/.env.production.local <<EOF
VITE_API_BASE_URL=$api_url
VITE_COGNITO_CLIENT_ID=$client_id
VITE_AWS_REGION=$REGION
EOF

(cd web && npm ci && npm run build)

ENVIRONMENT="$ENVIRONMENT" npx cdk deploy "web-stack-$ENVIRONMENT" --require-approval never
