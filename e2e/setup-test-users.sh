#!/bin/bash
# Provisions the fixed e2e test users in the Cognito pool. Idempotent — safe to re-run.
#
# Reads credentials from test-accounts.json and pool config from .env. Must be run
# once before the test suite (and again after any environment wipe); the signIn
# fixture no longer creates users and fails with a pointer to this script instead.
#
# Confirming via admin-confirm-sign-up triggers the PostConfirmation lambda, which
# creates each user's DynamoDB profile and likes playlist — same as a real signup.
set -euo pipefail
cd "$(dirname "$0")"

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${COGNITO_USER_POOL_ID:?must be set in e2e/.env}"
: "${COGNITO_CLIENT_ID:?must be set in e2e/.env}"

python3 -c "
import json
for account in json.load(open('test-accounts.json')).values():
    print(account['username'], account['password'])
" | while read -r username password; do
  if aws cognito-idp admin-get-user \
      --user-pool-id "$COGNITO_USER_POOL_ID" \
      --username "$username" >/dev/null 2>&1; then
    echo "exists   $username"
    continue
  fi

  aws cognito-idp sign-up \
    --client-id "$COGNITO_CLIENT_ID" \
    --username "$username" \
    --password "$password" \
    --user-attributes "Name=email,Value=${username}@melo-e2e.invalid" >/dev/null

  aws cognito-idp admin-confirm-sign-up \
    --user-pool-id "$COGNITO_USER_POOL_ID" \
    --username "$username"

  echo "created  $username"
done

echo "done — test users ready"
