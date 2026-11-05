#!/bin/bash
# Read-only: lists existing profiles whose username is now reserved (Domain/ReservedUsernames.cs),
# because profiles moved to the site root (/{username}) and those names would collide with an
# app path or a static file. Sign-up refuses them from now on; anyone listed here was created
# before that and needs a decision (in dev: delete and recreate the account).
#
# Usage: ENVIRONMENT=dev ./scripts/check-reserved-usernames.sh
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
TABLE="melo-melo-table-$ENVIRONMENT"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/api/Domain/ReservedUsernames.cs"

# Both rules, read from their one source: the word list and the file-extension regex
WORDS=$(sed -n '/Words =/,/];/p' "$SOURCE" | grep -o '"[a-z0-9._-]*"' | tr -d '"' | tr '\n' ' ')
EXTENSIONS=$(grep -o 'GeneratedRegex(@"[^"]*")' "$SOURCE" | sed 's/GeneratedRegex(@"//; s/")$//')

usernames=$(aws dynamodb scan --table-name "$TABLE" \
  --filter-expression "begins_with(PK, :user) AND SK = :profile" \
  --expression-attribute-values '{":user":{"S":"USER#"},":profile":{"S":"PROFILE"}}' \
  --projection-expression "PK" \
  --output json | jq -r '.Items[].PK.S | ltrimstr("USER#")')

clashes=0
for name in $usernames; do
  lower=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  reserved=0
  for word in $WORDS; do [ "$word" = "$lower" ] && reserved=1; done
  if [ "$reserved" = "0" ] && echo "$lower" | grep -Eq "$EXTENSIONS"; then reserved=1; fi
  if [ "$reserved" = "1" ]; then
    echo "reserved: $name"
    clashes=$((clashes + 1))
  fi
done

echo "$TABLE: $clashes profile(s) use a reserved username."
