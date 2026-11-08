#!/bin/bash
# Turns two-step verification (authenticator-app TOTP) off for one user — the recovery for a
# lost phone, since Cognito TOTP has no backup codes and a password reset doesn't turn it off.
# They then sign in with just their password and can turn it back on in Settings.
#
# Usage: ./scripts/disable-two-step.sh <username> [env]   (env defaults to dev)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -lt 1 ]; then
  echo "Usage: $0 <username> [env]" >&2
  exit 1
fi

USERNAME=$(echo "$1" | tr '[:upper:]' '[:lower:]') # usernames are stored lowercase
ENVIRONMENT="${2:-dev}"

pool_id=$(aws cloudformation describe-stacks --stack-name "auth-stack-$ENVIRONMENT" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
if [ -z "$pool_id" ] || [ "$pool_id" = "None" ]; then
  echo "Could not find the user pool for $ENVIRONMENT — is auth-stack-$ENVIRONMENT deployed?" >&2
  exit 1
fi

# Fails loudly if there's no such user
aws cognito-idp admin-get-user --user-pool-id "$pool_id" --username "$USERNAME" >/dev/null

aws cognito-idp admin-set-user-mfa-preference \
  --user-pool-id "$pool_id" \
  --username "$USERNAME" \
  --software-token-mfa-settings Enabled=false,PreferredMfa=false

echo "Two-step verification is off for $USERNAME ($ENVIRONMENT)."
