# Home Feed

Part of the [data model](README.md). A per-user materialized index: the unified home feed (things shared *with* you). Written in the same batch/transaction as the underlying share (see [tracks.md](tracks.md) and [albums.md](albums.md)) and display-only — a partial failure drifts it without affecting access.

## Item Types & Key Schema

### Feed Item (unified home feed, per recipient)

| PK | SK | GSI1PK | GSI1SK | GSI2SK |
|----|-----|--------|--------|--------|
| `FEED#{recipient}` | `{TRACK\|ALBUM}#{targetId}` | `FEED#{recipient}` | `DATE#{sharedAt}` | `{TRACK\|ALBUM}#DATE#{sharedAt}` |

Attributes: `type` (`TRACK` \| `ALBUM`), `targetId`, `senderUsername`, `caption?`, `sharedAt`

Unifies "tracks shared with me" and "albums shared with me" into one partition so `GET /feed` returns both interleaved, date-sorted, filterable by type. Base SK is **deterministic** (`{type}#{targetId}`) so unshare/delete is a keyed delete with no timestamp lookup. GSI1 carries the all-types date sort; GSI2 (same hash key, `{TYPE}#DATE#{ts}` sort) makes the type filter a pure key condition (`begins_with`) instead of a post-read `FilterExpression`. Written by the `FeedItems` helper on every share path (upload `sharedWith`, track share, album share), removed on unshare and on track/album deletion.

---

## Access Patterns

### Feed API

#### `GET /feed` — GetFeedLambda
Params: `cursor`, `type` (`TRACK`\|`ALBUM`, optional), `sort` (`asc`\|`desc`, default `desc`).
1. No `type`: `Query(GSI1, GSI1PK=FEED#{requestor}, GSI1SK begins_with DATE#, cursor)`. With `type`: `Query(GSI2, GSI1PK=FEED#{requestor}, GSI2SK begins_with {TYPE}#DATE#, cursor)` — both pure key conditions, no `FilterExpression`
2. Hydrate: parallel BatchGet sender profiles + tracks (`TrackBatchLookup`) + album metas; assemble `FeedEntry` (track XOR album per `type`), dropping entries whose target no longer resolves → `PaginatedResult<FeedEntry>`
