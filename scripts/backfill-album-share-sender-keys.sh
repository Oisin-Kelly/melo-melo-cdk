#!/bin/bash
# One-off: give album share records written before GSI2SK existed their sender sort key,
# so GET /users/{username}/albums/shared (GSI2, begins_with SENDER#{owner}#) finds them.
#   GSI2SK = SENDER#{albumOwnerUsername}#DATE#{sharedAt}   (exactly what ShareAlbumAsync writes)
# Only album share records match (PK ALBUM#…, SK SHARED#…); album grants live on TRACK#
# partitions and are never touched. Idempotent: records that already have GSI2SK are skipped.
#
# Usage: ENVIRONMENT=dev ./scripts/backfill-album-share-sender-keys.sh           # dry run: lists what would change
#        ENVIRONMENT=dev ./scripts/backfill-album-share-sender-keys.sh --apply   # writes
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
TABLE="melo-melo-table-$ENVIRONMENT"
APPLY=0
if [ "${1:-}" = "--apply" ]; then APPLY=1; fi

# The CLI follows scan pagination itself; one JSON line per record that needs the key
rows=$(aws dynamodb scan --table-name "$TABLE" \
  --filter-expression "begins_with(PK, :album) AND begins_with(SK, :shared) AND attribute_not_exists(GSI2SK)" \
  --expression-attribute-values '{":album":{"S":"ALBUM#"},":shared":{"S":"SHARED#"}}' \
  --projection-expression "PK, SK, albumOwnerUsername, sharedAt" \
  --output json |
  jq -c '.Items[] | {pk: .PK.S, sk: .SK.S, owner: .albumOwnerUsername.S, at: .sharedAt.N}')

if [ -z "$rows" ]; then
  echo "$TABLE: no album shares need GSI2SK — nothing to do."
  exit 0
fi

count=0
skipped=0
while IFS= read -r row; do
  pk=$(echo "$row" | jq -r .pk)
  sk=$(echo "$row" | jq -r .sk)
  owner=$(echo "$row" | jq -r .owner)
  at=$(echo "$row" | jq -r .at)
  if [ "$owner" = "null" ] || [ "$at" = "null" ]; then
    echo "skip $pk $sk (missing albumOwnerUsername or sharedAt)"
    skipped=$((skipped + 1))
    continue
  fi
  value="SENDER#$owner#DATE#$at"
  if [ "$APPLY" = "1" ]; then
    # attribute_exists guard: never resurrect a share deleted since the scan
    aws dynamodb update-item --table-name "$TABLE" \
      --key "$(jq -nc --arg pk "$pk" --arg sk "$sk" '{PK: {S: $pk}, SK: {S: $sk}}')" \
      --update-expression "SET GSI2SK = :v" \
      --condition-expression "attribute_exists(PK)" \
      --expression-attribute-values "$(jq -nc --arg v "$value" '{":v": {S: $v}}')" >/dev/null
    echo "set  $pk $sk -> $value"
  else
    echo "would set $pk $sk -> $value"
  fi
  count=$((count + 1))
done <<EOF
$rows
EOF

if [ "$APPLY" = "1" ]; then
  echo "$TABLE: updated $count album share(s), skipped $skipped."
else
  echo "$TABLE: $count album share(s) would be updated, $skipped skipped. Re-run with --apply to write."
fi
