# Tracks, Sharing & Likes

Part of the [data model](README.md). Covers tracks, the upload-status record, direct track shares, and track likes. See the [track access rule](README.md#track-access-rule) for the shared gating logic.

## Item Types & Key Schema

### Track

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `USER#{ownerUsername}` | `TRACK#{trackId}` | `TRACK#{trackId}` | `INFO` | `USER#{ownerUsername}` | `DATE#{createdAt}` |

Attributes: `trackName`, `description`, `genre`, `imageUrl`, `imageBgColor`, `createdAt`, `duration`, `slug` (canonical readable URL — [README.md](README.md#readable-urls-slugs)), `likeCount`, `shareCount` (direct-share recipient count; grants excluded — both counts owner-only in responses)

Derived: `OwnerUsername` from `PK.Replace("USER#", "")`, `TrackId` from `SK.Replace("TRACK#", "")`

GSI1 gives by-id lookup (owner unknown at query time); GSI3 gives the owner's tracks newest-first (base-table SK order is random GUID order, so it can't serve a chronological listing).

### Upload Status

| PK | SK |
|----|-----|
| `USER#{username}` | `UPLOAD#{trackId}` |

Attributes: `status` (`PROCESSING` / `COMPLETE` / `FAILED`), `error`, `createdAt`, `expiresAt` (table TTL attribute — records self-expire after 24h). No GSI keys — only ever fetched point-wise by the owner.

Written by `UploadTrackLambda` (PROCESSING, before starting the state machine), finalized by `ProcessTrackLambda` (COMPLETE, or FAILED with a user-safe reason from its catch block — e.g. not an audio file, or over the 24-hour per-track duration cap checked via ffprobe before encoding — when ffprobe can't read a duration (`N/A`), the encode is capped with `-t` just past the limit and the encoded file's duration is checked instead; unreadable even then → FAILED).

### Shared Track

| PK | SK | GSI1PK | GSI1SK | GSI2SK |
|----|-----|--------|--------|--------|
| `TRACK#{trackId}` | `SHARED#{recipientUserId}` | `SHARED#{recipientUserId}` | `DATE#{epochMs}` | `SENDER#{senderUserId}#DATE#{epochMs}` |

Attributes: `caption`, `sharedAt`, `trackOwnerUsername`

GSI1SK is a date prefix for chronological feed sorting (GSI1).
GSI2SK is a sender+date prefix for per-sender filtered sorting (GSI2). Both GSI1 and GSI2 share GSI1PK as the hash key.
`trackOwnerUsername` is stored for efficient BatchGet without parsing sort keys.

### Like (likes-playlist membership, stored track-side)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `TRACK#{trackId}` | `LIKE#{username}` | `LIKES#{username}` | `DATE#{epochMs}` |

Attributes: `trackOwnerUsername`, `duration` (denormalized so unlike can decrement the likes playlist's `totalDurationSeconds` without re-fetching the track), `likedAt`

Track-side base key lets the owner query who liked; GSI1 gives the user's liked-tracks feed. The Track item carries a `likeCount` attribute and the liker's likes-playlist meta carries `trackCount`/`totalDurationSeconds`, all maintained transactionally (`ADD :±`) with like/unlike writes; read-before-write is the fast path, and an `attribute_not_exists(PK)` / `attribute_exists(PK)` guard on the like record (via `TryExecuteTransactWriteAsync`) makes the toggle idempotent under concurrency — a double-tapped like cancels the loser's whole transaction, so the like record (and with it the owner's activity row, which the [stream consumer](README.md#stream-consumers) derives from it) is written once. The guarded put goes through `IDynamoDBService.AddConditionalSave` (the SDK's typed put takes no condition).

---

## Access Patterns

### Track APIs

#### `GET /tracks/{trackId}` — GetTrackLambda
1. `Query(GSI1, GSI1PK=TRACK#{trackId}, GSI1SK=INFO)` → get TrackDataModel (owner unknown at query time, need GSI)
2. `GetItem(PK=USER#{ownerUsername}, SK=PROFILE)` → get track owner's profile
3. If not owner, [track access check](README.md#track-access-rule) — 404 if neither direct share nor album grant
4. In parallel: `GetItem(PK=TRACK#{trackId}, SK=LIKE#{requestor})` → sets `likedByMe`; for a non-owner, `GetItem(PK=TRACK#{trackId}, SK=SHARED#{requestor})` → `myShare {sharedAt, caption?}` (their direct share only — absent when they have the track through an album alone). `likeCount`/`shareCount` returned to the owner only

#### `GET /tracks/{trackId}/appears-in` — GetTrackAppearsInLambda
Where a track is found, for its page. Same 404 rule as `GET /tracks/{trackId}`, then in parallel:
- **Albums** (`IAlbumTracklistRepository.GetAlbumsContainingTrackAsync`): memberships are keyed by album, so for the **owner** `Query(PK=USER#{owner}, begins_with ALBUM#)` → every album meta, then one BatchGet of `ALBUM#{id}/TRACK#{trackId}` keeps the ones holding it (the same probe `RemoveTrackFromAllAlbumsAsync` uses). For **anyone else**, only albums shared with them: `Query(PK=TRACK#{trackId}, begins_with SHARED#{viewer}#ALBUM#)` → their album grants → BatchGet the metas. Hydrated to `AlbumSummary` (owner profile + viewer like status), newest first.
- **Playlists** (`IPlaylistRepository.GetPlaylistsContainingTrackAsync`): the viewer's own custom playlists only (playlists are private; Liked tracks is left out — the heart says that): `Query(PK=USER#{viewer}, begins_with PLAYLIST#)` → BatchGet `PLAYLIST#{id}/TRACK#{trackId}` → `Playlist`s holding it, newest first.

No index of its own: a user's albums/playlists are few, so list-then-probe is two reads each. → `{albums: AlbumSummary[], playlists: Playlist[]}`

#### `GET /tracks` — GetUserTracksLambda
1. `Query(GSI3, GSI3PK=USER#{requestor}, GSI3SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated track items newest-first
2. Fetch owner profile once: `GetItem(PK=USER#{requestor}, SK=PROFILE)` → returns `PaginatedResult<Track>`

#### `GET /tracks/shared` — GetTracksSharedWithUserLambda
1. `Query(GSI1, GSI1PK=SHARED#{requestor}, GSI1SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated shared items newest-first
2. **Parallel BatchGet** (two concurrent calls):
   - Tracks: `BatchGet(PK=USER#{item.TrackOwnerUsername}, SK=item.Pk)` for each shared item
   - Owners: `BatchGet(PK=USER#{item.TrackOwnerUsername}, SK=PROFILE)` for each unique owner (deduplicated)
3. In-memory join: match tracks to owners → returns `PaginatedResult<SharedTrack>`

#### `GET /users/{username}/shared` — GetTracksSharedFromUserLambda
1. `Query(GSI2, GSI1PK=SHARED#{requestor}, GSI2SK begins_with SENDER#{username}#, Limit=10, ScanIndexForward=false, cursor)` → paginated shared items from a specific sender newest-first
2. Same parallel BatchGet + join as above → returns `PaginatedResult<SharedTrack>`

#### `GET /tracks/library` — GetLibraryTracksLambda
Every track the caller can play, in one unpaged `PaginatedResult<TrackSummary>` (`nextCursor` null) for the client's search index — the [access rule](README.md#track-access-rule) as a listing:
1. In parallel: own tracks `Query(GSI3, USER#{requestor}, begins_with DATE#)`, direct shares `Query(GSI1, SHARED#{requestor}, begins_with DATE#)`, album shares `Query(GSI1, ALBUMSHARED#{requestor}, begins_with DATE#)` — every page of each
2. Each shared album's tracklist `Query(PK=ALBUM#{id}, begins_with TRACK#)` (owner = the album's owner), in parallel
3. Union deduped by track id (own rows win), then the shared refs through `TrackBatchLookup.GetTrackSummariesAsync` (tracks + owners + like status) → sorted by name

#### `PUT /tracks/{trackId}` — UpdateTrackLambda
Owner-only (404 otherwise)
1. Track fetch (GSI1 by-id) → owner check
2. Optional: `IImageService.ProcessImageAsync` (dropbox key → `tracks/{id}/cover_400x400.jpg` in the public bucket, derives `imageBgColor`)
3. **TransactWrite** `SET`/`REMOVE` on the Track item (`trackName` required; `genre`/`description` cleared when absent; `clearedImage` removes image fields). Renaming never touches `slug`; an explicit `slug` adds its guarded slug-record put to the same transaction — taken → 400 — [slug](README.md#readable-urls-slugs)
4. Read back via base-table `GetItem` (not the GSI — eventual consistency) + owner profile → `Track`

#### `POST /tracks/{trackId}/share` — ShareTrackLambda
Owner-only (404 otherwise). `{add: [], remove: [], caption?}`, ≤50 people in `add` and ≤50 in `remove` per request; no total cap on direct recipients.
1. Track fetch → owner check
2. `Query(PK=TRACK#{id}, SK begins_with SHARED#)` **excluding `#ALBUM#` grant records** → current direct recipients
3. Validate adds: `GetValidatedRecipientsAsync` (strips self, dupes, unknown users, and recipients whose `incomingShares` setting blocks the sender — `FOLLOWING` checks `Query(PK=FOLLOW#{sender}, begins_with USER#{recipient}#)` per candidate). The Lambda passes the **full** validated add list (no pre-dedup); `ShareTrackAsync` classifies each against the current direct shares (upsert)
4. **BatchWrite** (upsert per recipient — every recipient in `add` is written): **new** recipient → put SharedTrack item (`GSI1SK=DATE#{now}`, `GSI2SK=SENDER#{owner}#DATE#{now}`, `caption`, `via: LINK` on a share-link accept) + feed, `shareCount +1`; **existing** recipient → overwrite the item with fresh `DATE#{now}` + the request's caption (resurfaces the feed & shared-with lists), no count change. No same-caption short-circuit; re-sharing without a caption overwrites the stored caption to null. A user in both `add` and `remove` → remove wins. Removes delete direct-share items — album grant records are never touched, so album-derived access survives. Feed writes share the batch ([feed.md](feed.md)); the recipients' `TRACK_SHARED` activity follows from the share records via the stream ([activity.md](activity.md)) — a re-share moves it to the top

#### `DELETE /tracks/shared/{trackId}` — RemoveSharedTrackLambda
Recipient-side "remove from my library" — the mirror of a single-recipient unshare, callable by anyone (drops the caller's own share; no owner check). `RemoveTrackFromLibraryAsync`:
1. `GetItem(PK=TRACK#{id}, SK=SHARED#{requestor})` → **idempotency guard**: no-op 200 if absent
2. **One transaction**: delete the direct-share item (guarded `attribute_exists(PK)`) + its feed item (`FEED#{requestor}` / `TRACK#{id}`) + step 3's counter — a concurrent double-remove cancels the loser, so it decrements once; the album grant records (`SHARED#{requestor}#ALBUM#{id}`) are **never touched**, so a track that is also in a shared album stays accessible via that album ([access rule](README.md#track-access-rule) = direct OR album grant)
3. Decrement the owner's `shareCount` by 1, in that same transaction (kept equal to the live direct-share record count, so the re-share upsert stays consistent). Deleting the share record also deletes its `TRACK_SHARED` activity row (stream consumer), same as owner-side unshare.

#### `GET /tracks/{trackId}/recipients` — GetTrackRecipientsLambda
Owner-only (404 otherwise). `Query(PK=TRACK#{id}, begins_with SHARED#)` filtered to direct shares (drops `#ALBUM#` grant SKs) → BatchGet profiles → `{items:[{user, sharedAt}]}` newest-first. Bounded, no pagination.

#### `GET /tracks/{trackId}/stream` — GetTrackSegmentsLambda
1. Track fetch (GSI1 by-id) → **access check** (owner OR `IsTrackAccessibleToUser`) — 404 otherwise
2. Presign one GET URL for the processed audio (`processed/{trackId}/audio.m4a`, private bucket, 6h expiry) → `{url, expiresAt, duration}`. The client range-requests this single URL; `+faststart` on the file makes seeking work without a full download.

#### `GET /tracks/{trackId}/original` — GetOriginalTrackLambda
Owner-only: the original upload, in the format it was uploaded in.
1. Track fetch (GSI1 by-id) → **owner check** — anyone else, recipients included, gets 404
2. `HeadObject(processed/{trackId}/original)` in the private bucket → its Content-Type (404 "The original file isn't available for this track" if absent — tracks processed before originals were archived)
3. Presign a 5-minute GET with `response-content-disposition: attachment; filename="…"; filename*=UTF-8''…` → `{url, fileName, contentType, expiresAt}`. `fileName` is `{track name}.{ext}` (`Domain/OriginalDownloads`: extension from the content type, filesystem-unsafe characters removed). No table writes.

#### `GET /tracks/uploads/{trackId}` — GetUploadStatusLambda
1. `GetItem(PK=USER#{requestor}, SK=UPLOAD#{trackId})` → `{trackId, status, error?, createdAt}` (404 if absent/expired)

#### `DELETE /tracks/{trackId}` — DeleteTrackLambda
Owner-only (404 otherwise). Ordered so any mid-delete crash is retryable (track stays fetchable until the last step):
1. Track fetch → owner check
2. For each of the owner's albums: `GetItem(ALBUM#{albumId}, TRACK#{trackId})` → if a member, `RemoveTracksAsync` (revokes that album's per-recipient grants, then the membership)
3. Delete S3 objects: `processed/{trackId}/audio.m4a` + the archived source `processed/{trackId}/original` + the preview clip `processed/{trackId}/preview.m4a` (private bucket) + cover (public bucket)
4. `Query(PK=TRACK#{trackId}, SK begins_with SHARED#)` + `begins_with LIKE#` → each like is deleted in its own transaction with its liker's likes-playlist decrement (`ADD trackCount -1, totalDurationSeconds -duration`, guarded `attribute_exists` on the like so retries/concurrent unlikes never double-decrement); then batch-delete direct shares (and their feed items), leftover grants, the `UPLOAD#{trackId}` status record, every [share link](links.md) to the track, and every [slug](README.md#readable-urls-slugs) record (`USER#{owner}` / `SLUG#TRACK#…` with this `targetId`)
5. Delete the Track item (`USER#{owner}`, `TRACK#{trackId}`) last

Playlist membership records referencing the track (any user's — not enumerable by track) are left dangling; playlist reads surface them as removable placeholders (see [playlists.md](playlists.md)).

### Like APIs

#### `POST /tracks/{trackId}/like` — LikeTrackLambda
Request body: `{newValue: true|false}` (mirrors follow-user)
1. Track fetch via GSI1 → 404 if missing; like requires access (owner/direct/album-grant), unlike always allowed
2. Read-before-write: `GetItem(PK=TRACK#{id}, SK=LIKE#{requestor})` — no-op if state already matches (idempotent; protects `likeCount`)
3. **TransactWrite** (3 parts): save/delete Like item + `ADD likeCount :±1` on the Track item + `ADD trackCount :±1, totalDurationSeconds :±duration` on the requestor's likes-playlist meta. The owner's `TRACK_LIKED` activity (non-self likes) follows from the like record being added/removed, via the stream ([activity.md](activity.md))

#### `GET /tracks/{trackId}/likes` — GetTrackLikesLambda
Owner-only (404 otherwise)
1. Track fetch → owner check
2. `Query(PK=TRACK#{id}, begins_with LIKE#, Limit=25, cursor)` → like records
3. `BatchGet` liker profiles → `{likeCount, items: [{user, likedAt}], nextCursor}`
