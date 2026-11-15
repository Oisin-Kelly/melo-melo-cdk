#!/bin/bash
# One-off, after activity moved to the table's stream (TableEventsLambda): tidies the activity
# rows written the old way, inline with each like/share/follow.
#
#   - Old like/share rows (SK DATE#{ts}#{8 hex chars}, a random suffix) are DELETED. The stream
#     consumer can't rebuild or delete their keys, and they may belong to likes/shares that were
#     undone long ago (the old read-side check that hid those is gone).
#   - Follow rows (SK DATE#{ts}#FOLLOW#{follower}) already use the new key format and stay valid;
#     only their expiresAt is REMOVED, since activity no longer expires.
#   - Rows already in the new format (…#LIKE#…, …#SHARE#…) aren't touched.
#
# Lists what it will do and asks before changing anything. Run once per environment, after the
# stack with the stream consumer is deployed (until then old Lambdas keep writing old rows).
#
# Usage: ./scripts/cleanup-activity.sh [env]   (env defaults to dev)
set -euo pipefail
cd "$(dirname "$0")/.."

ENVIRONMENT="${1:-dev}"
TABLE="melo-melo-table-$ENVIRONMENT"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "Scanning $TABLE for activity rows…"
aws dynamodb scan --table-name "$TABLE" \
  --filter-expression "begins_with(PK, :p)" \
  --expression-attribute-values '{":p":{"S":"ACTIVITY#"}}' \
  --projection-expression "PK, SK, expiresAt" \
  --output json > "$WORK/scan.json"

# Old like/share rows: DATE#{digits}#{8 hex}; follow rows still carrying expiresAt
jq -c '[.Items[] | select(.SK.S | test("^DATE#[0-9]+#[0-9a-f]{8}$")) | {PK: .PK, SK: .SK}]' \
  "$WORK/scan.json" > "$WORK/old.json"
jq -c '[.Items[] | select((.SK.S | test("^DATE#[0-9]+#FOLLOW#")) and has("expiresAt")) | {PK: .PK, SK: .SK}]' \
  "$WORK/scan.json" > "$WORK/follows.json"

old_count=$(jq 'length' "$WORK/old.json")
follow_count=$(jq 'length' "$WORK/follows.json")
total=$(jq '.Items | length' "$WORK/scan.json")
echo "$total activity rows: $old_count old like/share rows to delete, $follow_count follow rows to keep forever."
if [ "$old_count" -eq 0 ] && [ "$follow_count" -eq 0 ]; then
  echo "Nothing to do."
  exit 0
fi

printf "Apply to %s? [y/N] " "$TABLE"
read -r answer
if [ "$answer" != "y" ]; then
  echo "Nothing changed."
  exit 1
fi

# Deletes in batches of 25 (BatchWriteItem's limit)
if [ "$old_count" -gt 0 ]; then
  jq -c --arg t "$TABLE" '
    [_nwise(25)] | .[] | {($t): [.[] | {DeleteRequest: {Key: .}}]}' "$WORK/old.json" |
  while read -r batch; do
    unprocessed=$(aws dynamodb batch-write-item --request-items "$batch" --output json |
      jq -c '.UnprocessedItems')
    # Retry whatever DynamoDB pushed back (throttling) until it's all gone
    while [ "$unprocessed" != "{}" ]; do
      sleep 1
      unprocessed=$(aws dynamodb batch-write-item --request-items "$unprocessed" --output json |
        jq -c '.UnprocessedItems')
    done
  done
  echo "Deleted $old_count old like/share rows."
fi

if [ "$follow_count" -gt 0 ]; then
  jq -c '.[]' "$WORK/follows.json" | while read -r key; do
    aws dynamodb update-item --table-name "$TABLE" --key "$key" --update-expression "REMOVE expiresAt"
  done
  echo "Follow rows no longer expire: $follow_count."
fi
