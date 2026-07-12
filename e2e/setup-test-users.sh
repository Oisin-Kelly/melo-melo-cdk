#!/bin/bash
# Provisions the fixed e2e test users in the Cognito pool. Idempotent — safe to re-run.
#
# Generates test-accounts.json (random per-environment passwords) if it doesn't
# exist yet, then reads pool config from .env. Must be run once before the test
# suite (and again after any environment wipe); the signIn fixture no longer
# creates users and fails with a pointer to this script instead.
#
# If the pool already has the users, keep the existing test-accounts.json — the
# passwords in it are the ones Cognito knows. Delete the file only together with
# the users (or the whole environment).
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

if [ ! -f test-accounts.json ]; then
  # "Aa1!" prefix satisfies the pool policy (upper/lower/digit/symbol)
  python3 -c "
import json, secrets
accounts = {
    key: {'username': name, 'password': f'Aa1!{secrets.token_hex(12)}'}
    for key, name in [('userA', 'melotesta'), ('userB', 'melotestb'), ('userC', 'melotestc')]
}
json.dump(accounts, open('test-accounts.json', 'w'), indent=2)
"
  echo "generated test-accounts.json"
fi

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
