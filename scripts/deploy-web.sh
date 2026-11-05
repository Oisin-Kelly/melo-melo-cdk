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
pool_id=$(aws cloudformation describe-stacks --stack-name "auth-stack-$ENVIRONMENT" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

# The site's own URL, for the link-preview image (absent on the very first deploy — the card
# then uses a relative image URL until the next one)
site_url=$(aws cloudformation describe-stacks --stack-name "web-stack-$ENVIRONMENT" \
  --query "Stacks[0].Outputs[?OutputKey=='WebUrl'].OutputValue" --output text 2>/dev/null | sed 's:/*$::' || true)
if [ "$site_url" = "None" ]; then site_url=""; fi

if [ -z "$api_url" ] || [ -z "$client_id" ] || [ -z "$pool_id" ]; then
  echo "Could not read stack outputs for $ENVIRONMENT — is the backend deployed?" >&2
  exit 1
fi

cat > web/.env.production.local <<EOF
VITE_API_BASE_URL=$api_url
VITE_COGNITO_CLIENT_ID=$client_id
VITE_COGNITO_USER_POOL_ID=$pool_id
VITE_AWS_REGION=$REGION
VITE_SITE_URL=$site_url
EOF

(cd web && npm ci && npm run build)

# --exclusively: only this stack — and only its assets get bundled. Without it, synthesising the
# app rebuilds every Lambda in Docker first (web-stack has no Lambdas and depends on no stack).
ENVIRONMENT="$ENVIRONMENT" npx cdk deploy "web-stack-$ENVIRONMENT" --exclusively --require-approval never
