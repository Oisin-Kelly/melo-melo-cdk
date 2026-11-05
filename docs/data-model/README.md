# Data Model & Access Patterns

MeloMelo uses a single DynamoDB table. This folder documents the key schema and every API's access-pattern chain, split by domain.

Table: `melo-melo-table-{env}` | Keys: `PK` (hash), `SK` (range)
Index: `GSI1` — `GSI1PK` (hash), `GSI1SK` (range), projection ALL
Index: `GSI2` — `GSI1PK` (hash), `GSI2SK` (range), projection ALL
Index: `GSI3` — `GSI3PK` (hash), `GSI3SK` (range), projection ALL

## Domain files

| File | Entities | APIs |
|------|----------|------|
| [users.md](users.md) | User Profile, Follow Relationship, Slug | Cognito triggers, profile, search, follows, `POST /me/seen`, slug resolve |
| [tracks.md](tracks.md) | Track, Upload Status, Shared Track, Like (track-side) | track CRUD, sharing, segments, uploads, track likes |
| [playlists.md](playlists.md) | Playlist meta, Playlist Track | playlist CRUD, membership, ordering |
| [albums.md](albums.md) | Album meta, Album Track, Album Share, Album Track Grant, Album Like | album CRUD, sharing, ordering, album likes |
| [feed.md](feed.md) | Feed Item | `GET /feed` |
| [activity.md](activity.md) | Activity Item, User Progress | `GET /activity`, `POST /me/activity-seen`, `PUT`/`GET /me/progress` |
| [links.md](links.md) | Share Link, preview clip | `/links` create/list/revoke/restore, public `GET /links/{token}`, viewer, accept |

## Cross-cutting conventions

These rules span domains; the domain files reference them.

### Track access rule

Used by GetTrack, LikeTrack, playlist reads, progress resolution. The requestor is granted access if: requestor is owner, OR `GetItem(PK=TRACK#{id}, SK=SHARED#{user})` exists (direct share), OR `Query(PK=TRACK#{id}, SK begins_with SHARED#{user}#ALBUM#)` returns an item (album grant) — the last two run in parallel (`ISharedTrackRepository.IsTrackAccessibleToUser`). The two lookups must stay separate: `begins_with SHARED#{user}` alone would prefix-match other usernames (`bob` → `bobby`).

### Counters

`CounterExpressions.Add` → `ADD` transactions, absent attribute treated as 0: album `trackCount`/`totalDurationSeconds`/`shareCount`, playlist `trackCount`/`totalDurationSeconds` (on the likes playlist maintained by the like/unlike transaction), track `shareCount`, track/album `likeCount`, user follower/following counts. Deltas cover only genuine changes — re-adding an existing playlist member is a no-op, the declarative tracklist saves adjust by their computed diff, and a share is an upsert where only genuinely-new recipients count (re-shared recipients are rewritten but don't move `shareCount`). The gesture writes (like/unlike, playlist add/remove, follow/unfollow, remove-from-library) guard their record with `attribute_not_exists`/`attribute_exists` in the same transaction as the counter (`AddConditionalSave` + `TryExecuteTransactWriteAsync`), so a concurrent duplicate request moves the count once. Removals read the membership's (or like record's) denormalized `duration`, so they reconcile even for a since-deleted track — and deleting a track decrements each liker's likes playlist as it deletes their like. Counter writes are display-only; a partial failure drifts a count without affecting access.

### Fan-out writes (`AlbumShareRepository` / `AlbumTracklistRepository`, via `AlbumRecords`)

Album share/unshare/add/remove/delete operations write or delete N recipients × M tracks grant items via `IDynamoDBService` batch writes (SDK chunks to 25 and retries unprocessed items). Ordering rule for crash-safety: mutate grant records first, the authoritative record (AlbumShare / membership / meta) last, so retrying a failed operation converges and a completed unshare never leaves hidden access. Limits: 50 tracks per album; recipients are capped **per request** (≤50 in `add` and ≤50 in `remove` on each share call, ≤50 `sharedWith` on upload) with no total cap per track or album.

**Known ceiling — fan-out runs in-line.** Every fan-out above runs synchronously inside the request's Lambda (30s timeout, ~25 items per batch call), and with no total recipient cap its size grows with the audience: an album tracklist save writes or deletes (changed tracks × all recipients) grants, an album delete or track delete removes every recipient's records, and a share call writes up to 50 × album tracks grants. That's comfortably fast for small private audiences (tens to low hundreds of recipients) but would start timing out somewhere in the thousands, leaving a half-applied fan-out (retry-safe thanks to the ordering rule, but slow and costly). **If albums/tracks ever get big audiences, move the fan-out to a queue (SQS → worker Lambda) or a Step Function** — the request writes the authoritative record and enqueues the grant work, and the client sees access arrive shortly after. Not built now on purpose; the recipients endpoints (`GET /tracks|albums/{id}/recipients`) are also unpaginated and would want a cursor at the same point.

### Readable URLs (slugs)

Tracks, albums and custom playlists have a readable URL — `/{owner}/{slug}`, `/{owner}/albums/{slug}`, `/{owner}/playlists/{slug}` — while their GUID stays the identity every key and endpoint uses. A slug is one more item in the owner's partition, `USER#{owner}` / `SLUG#{TRACK|ALBUM|PLAYLIST}#{slug}` → `targetId` (see [users.md](users.md#slug)), unique per owner per kind; the meta item's `slug` attribute is the canonical one.
- **Claim** (`SlugRecords.ClaimAsync`, on create — `ProcessTrackLambda`, `CreateAlbum`, `CreatePlaylist`): base from the name (`Domain/Slugs.FromTitle`: lowercase, accents stripped, other runs → `-`, ≤50 at a word boundary, the kind word if empty), then `base`, `base-2`, … — `Query(PK=USER#{owner}, begins_with SLUG#{KIND}#{base})` for what's taken, then a guarded put `attribute_not_exists(PK) OR targetId = :self` (so a retried upload reuses its own claim). That guarded put is the race protection: of concurrent requests for the same candidate DynamoDB lets exactly one through, and a loser moves straight on to the next free candidate (up to 25 writes), so N simultaneous same-name creates settle as `base` … `base-N`. A URL change claims in the same transaction as the meta update, so of two concurrent changes to one slug, one wins and the other is cancelled whole (400). Different owners never contend — slugs are per owner. Claimed before the meta item is written (meta last, as the authoritative record); an orphaned claim from a failed create just holds a name. Track slugs skip `Slugs.ReservedTrackSlugs` (`followers`, `albums`, … — they'd shadow a profile sub-route).
- **Rename never changes it.** An explicit `slug` on `PUT /tracks|albums|playlists/{id}` (null/omitted = unchanged; `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤60, not reserved) puts the new slug record with the same guard **in the same transaction** as `SET slug` on the meta item — taken → the whole update cancels → 400 "That URL is already used." The old record is never deleted, so it keeps resolving (a redirect); moving back to one of your own old slugs is allowed.
- **Delete**: each repository deletes every slug record of the item (`Query begins_with SLUG#{KIND}#`, filtered on `targetId`) before the meta item.
- **Resolve** (`GET /users/{username}/slugs/{kind}/{slug}`) checks access before revealing anything — every miss is the same 404. Usernames therefore can't be top-level app paths or static file names (`Domain/ReservedUsernames`, enforced at PreSignUp).
- Items made before slugs: `scripts/backfill-slugs.sh` (dry run by default); until then their links fall back to the id routes (`/tracks/{id}`, …), which still work and forward to the readable URL.

### Pagination

Paginated reads return `PaginatedResult<T>` with `Items` and a nullable base64url `NextCursor` (encoded inside `QueryPaginatedAsync`). Default `scanIndexForward: false` (newest first). The library listings (`GET /tracks`, `/tracks/shared`, `/playlists`, `/albums`, `/albums/shared`, `/albums/liked`) and `GET /users/search` accept an optional `?limit=` (default 10, clamped to 1–100 via `BaseLambdaFunctionHandler.ParseLimit`) so clients can pull larger pages for client-side search; other paginated endpoints keep fixed page sizes. `CountAsync` runs a `Select=COUNT` query.

### Adding a GSI

Requires three code changes (schema registered manually for AOT — no runtime `DescribeTable`): the CDK table in `infra/DataStack.cs`, the `TableBuilder` registration in `DynamoDBService`'s constructor, and the `GetKeyAttributeNames` mapping. Missing the `TableBuilder` entry fails at runtime with "Unable to locate index".
