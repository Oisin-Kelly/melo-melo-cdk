#!/bin/bash
# One-off: give tracks, albums and custom playlists made before readable URLs their slug, so they
# link as /{owner}/{slug}, /{owner}/albums/{slug}, /{owner}/playlists/{slug} instead of by id.
# Same rules as Domain/Slugs.cs (lowercase, accents folded by the same table, other runs → "-", base ≤50 at a word
# boundary, kind word if empty, "-2", "-3"… when taken, reserved track slugs skipped). Per item:
#   - slug record  PK=USER#{owner}  SK=SLUG#{KIND}#{slug}  targetId, createdAt   (attribute_not_exists)
#   - meta item    SET slug                                   (only if it exists and has no slug yet)
# written as one transaction, so a crash or a concurrent claim leaves nothing half-done; re-running
# skips items that already have a slug. The likes playlist never gets one (/liked is its URL).
#
# Usage: ENVIRONMENT=dev ./scripts/backfill-slugs.sh           # dry run: lists what would change
#        ENVIRONMENT=dev ./scripts/backfill-slugs.sh --apply   # writes
# The dry run checks each slug against the table, not against other items in the same run — two
# same-named items of one owner both show "-N"; --apply claims them one by one and picks correctly.
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
TABLE="melo-melo-table-$ENVIRONMENT"
APPLY=0
if [ "${1:-}" = "--apply" ]; then APPLY=1; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# The reserved track slugs, read from their one source (Slugs.ReservedTrackSlugs)
RESERVED=$(sed -n '/ReservedTrackSlugs =/,/];/p' "$ROOT/api/Domain/Slugs.cs" | grep -o '"[a-z0-9-]*"' | tr -d '"' | tr '\n' ' ')

slugify() { # title kind → base slug
  python3 - "$1" "$2" <<'PY'
import re, sys
title, kind = sys.argv[1], sys.argv[2]
# Same table as Slugs.Folds (the Lambdas can't use Unicode normalisation — InvariantGlobalization)
groups = [("àáâãäåāăą", "a"), ("çćĉċč", "c"), ("ďđ", "d"), ("èéêëēĕėęě", "e"), ("ĝğġģ", "g"),
          ("ĥħ", "h"), ("ìíîïĩīĭįı", "i"), ("ĵ", "j"), ("ķ", "k"), ("ĺļľŀł", "l"), ("ñńņňŉ", "n"),
          ("òóôõöøōŏő", "o"), ("ŕŗř", "r"), ("śŝşšș", "s"), ("ţťŧț", "t"), ("ùúûüũūŭůűų", "u"),
          ("ŵ", "w"), ("ýÿŷ", "y"), ("źżž", "z"), ("ß", "ss"), ("æ", "ae"), ("œ", "oe"), ("þ", "th"),
          ("ð", "d")]
folds = {c: plain for chars, plain in groups for c in chars}
s = ''.join(folds.get(c, c) for c in title.strip().lower())
s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
if len(s) > 50:
    cut = s[:50]
    s = (cut[:cut.rfind('-')] if cut.rfind('-') > 0 else cut).strip('-')
print(s or {'ALBUM': 'album', 'PLAYLIST': 'playlist'}.get(kind, 'track'))
PY
}

is_reserved() { # slug kind
  [ "$2" = "TRACK" ] || return 1
  for word in $RESERVED; do [ "$word" = "$1" ] && return 0; done
  return 1
}

slug_taken() { # owner kind slug
  local found
  found=$(aws dynamodb get-item --table-name "$TABLE" --consistent-read \
    --key "$(jq -nc --arg pk "USER#$1" --arg sk "SLUG#$2#$3" '{PK: {S: $pk}, SK: {S: $sk}}')" \
    --projection-expression "PK" --output json | jq -r '.Item.PK.S // empty')
  [ -n "$found" ]
}

# Owner meta items without a slug (likes excluded). The CLI follows scan pagination itself.
rows=$(aws dynamodb scan --table-name "$TABLE" \
  --filter-expression "begins_with(PK, :user) AND (begins_with(SK, :track) OR begins_with(SK, :album) OR begins_with(SK, :playlist)) AND attribute_not_exists(slug) AND SK <> :likes" \
  --expression-attribute-values '{":user":{"S":"USER#"},":track":{"S":"TRACK#"},":album":{"S":"ALBUM#"},":playlist":{"S":"PLAYLIST#"},":likes":{"S":"PLAYLIST#likes"}}' \
  --projection-expression "PK, SK, trackName, #n" \
  --expression-attribute-names '{"#n":"name"}' \
  --output json |
  jq -c '.Items[] | {pk: .PK.S, sk: .SK.S, title: (.trackName.S // .name.S // "")}')

if [ -z "$rows" ]; then
  echo "$TABLE: every track, album and playlist has a slug — nothing to do."
  exit 0
fi

now=$(($(date +%s) * 1000))
count=0
failed=0
while IFS= read -r row; do
  pk=$(echo "$row" | jq -r .pk)
  sk=$(echo "$row" | jq -r .sk)
  title=$(echo "$row" | jq -r .title)
  owner="${pk#USER#}"
  kind="${sk%%#*}"
  id="${sk#*#}"
  base=$(slugify "$title" "$kind")

  claimed=""
  n=1
  while [ -z "$claimed" ] && [ "$n" -le 50 ]; do
    if [ "$n" -eq 1 ]; then candidate="$base"; else candidate="$base-$n"; fi
    n=$((n + 1))
    if is_reserved "$candidate" "$kind" || slug_taken "$owner" "$kind" "$candidate"; then continue; fi
    if [ "$APPLY" = "0" ]; then
      claimed="$candidate"
      break
    fi
    items=$(jq -nc --arg spk "USER#$owner" --arg ssk "SLUG#$kind#$candidate" --arg id "$id" --arg at "$now" \
      --arg mpk "$pk" --arg msk "$sk" --arg slug "$candidate" --arg table "$TABLE" '[
        {Put: {TableName: $table,
               Item: {PK: {S: $spk}, SK: {S: $ssk}, targetId: {S: $id}, createdAt: {N: $at}},
               ConditionExpression: "attribute_not_exists(PK)"}},
        {Update: {TableName: $table, Key: {PK: {S: $mpk}, SK: {S: $msk}},
                  UpdateExpression: "SET slug = :s",
                  ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(slug)",
                  ExpressionAttributeValues: {":s": {S: $slug}}}}
      ]')
    if aws dynamodb transact-write-items --transact-items "$items" >/dev/null 2>&1; then
      claimed="$candidate"
    fi
    # A cancelled transaction: the slug was just taken (try the next) or the item changed — the
    # next candidate's attempt fails the same way and the loop gives up after 50
  done

  if [ -z "$claimed" ]; then
    echo "FAIL $pk $sk (\"$title\") — no slug claimed; it may have been deleted or got one meanwhile"
    failed=$((failed + 1))
  elif [ "$APPLY" = "1" ]; then
    echo "set  $owner $kind $id -> $claimed"
    count=$((count + 1))
  else
    echo "would set $owner $kind $id (\"$title\") -> $claimed"
    count=$((count + 1))
  fi
done <<EOF
$rows
EOF

if [ "$APPLY" = "1" ]; then
  echo "$TABLE: gave $count item(s) a slug, $failed failed."
else
  echo "$TABLE: $count item(s) would get a slug. Re-run with --apply to write."
fi
