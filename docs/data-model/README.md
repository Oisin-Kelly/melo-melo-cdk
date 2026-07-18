# Data Model & Access Patterns

MeloMelo uses a single DynamoDB table. This folder documents the key schema and every API's access-pattern chain, split by domain.

Table: `melo-melo-table-{env}` | Keys: `PK` (hash), `SK` (range)
Index: `GSI1` — `GSI1PK` (hash), `GSI1SK` (range), projection ALL
Index: `GSI2` — `GSI1PK` (hash), `GSI2SK` (range), projection ALL
Index: `GSI3` — `GSI3PK` (hash), `GSI3SK` (range), projection ALL

## Domain files

| File | Entities | APIs |
|------|----------|------|
| [users.md](users.md) | User Profile, Follow Relationship | Cognito triggers, profile, search, follows, `POST /me/seen` |
| [tracks.md](tracks.md) | Track, Upload Status, Shared Track, Like (track-side) | track CRUD, sharing, segments, uploads, track likes |
| [playlists.md](playlists.md) | Playlist meta, Playlist Track | playlist CRUD, membership, ordering |
| [albums.md](albums.md) | Album meta, Album Track, Album Share, Album Track Grant, Album Like | album CRUD, sharing, ordering, album likes |
| [feed.md](feed.md) | Feed Item | `GET /feed` |
| [activity.md](activity.md) | Activity Item, User Progress | `GET /activity`, `POST /me/activity-seen`, `PUT`/`GET /me/progress` |

## Cross-cutting conventions

These rules span domains; the domain files reference them.

### Track access rule

Used by GetTrack, LikeTrack, playlist reads, progress resolution. The requestor is granted access if: requestor is owner, OR `GetItem(PK=TRACK#{id}, SK=SHARED#{user})` exists (direct share), OR `Query(PK=TRACK#{id}, SK begins_with SHARED#{user}#ALBUM#)` returns an item (album grant) — the last two run in parallel (`ISharedTrackRepository.IsTrackAccessibleToUser`). The two lookups must stay separate: `begins_with SHARED#{user}` alone would prefix-match other usernames (`bob` → `bobby`).

### Counters

`CounterExpressions.Add` → `ADD` transactions, absent attribute treated as 0: album `trackCount`/`totalDurationSeconds`/`shareCount`, playlist `trackCount`/`totalDurationSeconds` (on the likes playlist maintained by the like/unlike transaction), track `shareCount`, track/album `likeCount`, user follower/following counts. Deltas cover only genuine changes — re-adding an existing playlist member is a no-op, the declarative tracklist saves adjust by their computed diff, and a re-shared recipient is pre-filtered out by the handler. Removals read the membership's (or like record's) denormalized `duration`, so they reconcile even for a since-deleted track. Counter writes are display-only; a partial failure drifts a count without affecting access.

### Fan-out writes (`AlbumRepository`)

Album share/unshare/add/remove/delete operations write or delete N recipients × M tracks grant items via `IDynamoDBService` batch writes (SDK chunks to 25 and retries unprocessed items). Ordering rule for crash-safety: mutate grant records first, the authoritative record (AlbumShare / membership / meta) last, so retrying a failed operation converges and a completed unshare never leaves hidden access. Limits: 50 tracks and 50 recipients per album.

### Pagination

Paginated reads return `PaginatedResult<T>` with `Items` and a nullable base64url `NextCursor` (encoded inside `QueryPaginatedAsync`). Default `scanIndexForward: false` (newest first). The library listings (`GET /tracks`, `/tracks/shared`, `/playlists`, `/albums`, `/albums/shared`, `/albums/liked`) and `GET /users/search` accept an optional `?limit=` (default 10, clamped to 1–100 via `BaseLambdaFunctionHandler.ParseLimit`) so clients can pull larger pages for client-side search; other paginated endpoints keep fixed page sizes. `CountAsync` runs a `Select=COUNT` query.

### Adding a GSI

Requires three code changes (schema registered manually for AOT — no runtime `DescribeTable`): the CDK table in `infra/DataStack.cs`, the `TableBuilder` registration in `DynamoDBService`'s constructor, and the `GetKeyAttributeNames` mapping. Missing the `TableBuilder` entry fails at runtime with "Unable to locate index".
