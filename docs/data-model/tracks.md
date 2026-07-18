# Tracks, Sharing & Likes

Part of the [data model](README.md). Covers tracks, the upload-status record, direct track shares, and track likes. See the [track access rule](README.md#track-access-rule) for the shared gating logic.

## Item Types & Key Schema

### Track

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `USER#{ownerUsername}` | `TRACK#{trackId}` | `TRACK#{trackId}` | `INFO` | `USER#{ownerUsername}` | `DATE#{createdAt}` |

Attributes: `trackName`, `description`, `genre`, `imageUrl`, `imageBgColor`, `createdAt`, `duration`, `segments`, `likeCount`, `shareCount` (direct-share recipient count; grants excluded — both counts owner-only in responses)

Derived: `OwnerUsername` from `PK.Replace("USER#", "")`, `TrackId` from `SK.Replace("TRACK#", "")`

GSI1 gives by-id lookup (owner unknown at query time); GSI3 gives the owner's tracks newest-first (base-table SK order is random GUID order, so it can't serve a chronological listing).

### Upload Status

| PK | SK |
|----|-----|
| `USER#{username}` | `UPLOAD#{trackId}` |

Attributes: `status` (`PROCESSING` / `COMPLETE` / `FAILED`), `error`, `createdAt`, `expiresAt` (table TTL attribute — records self-expire after 24h). No GSI keys — only ever fetched point-wise by the owner.

Written by `UploadTrackLambda` (PROCESSING, before starting the state machine), finalized by `ProcessTrackLambda` (COMPLETE, or FAILED with a user-safe reason from its catch block).

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

Track-side base key lets the owner query who liked; GSI1 gives the user's liked-tracks feed. The Track item carries a `likeCount` attribute and the liker's likes-playlist meta carries `trackCount`/`totalDurationSeconds`, all maintained transactionally (`ADD :±`) with like/unlike writes; read-before-write makes the toggle idempotent.

---

## Access Patterns

### Track APIs

#### `GET /tracks/{trackId}` — GetTrackLambda
1. `Query(GSI1, GSI1PK=TRACK#{trackId}, GSI1SK=INFO)` → get TrackDataModel (owner unknown at query time, need GSI)
2. `GetItem(PK=USER#{ownerUsername}, SK=PROFILE)` → get track owner's profile
3. If not owner, [track access check](README.md#track-access-rule) — 404 if neither direct share nor album grant
4. `GetItem(PK=TRACK#{trackId}, SK=LIKE#{requestor})` → sets `likedByMe`; `likeCount`/`shareCount` returned to the owner only

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

#### `PUT /tracks/{trackId}` — UpdateTrackLambda
Owner-only (404 otherwise)
1. Track fetch (GSI1 by-id) → owner check
2. Optional: `IImageService.ProcessImageAsync` (dropbox key → `tracks/{id}/cover_400x400.jpg` in the public bucket, derives `imageBgColor`)
3. **TransactWrite** `SET`/`REMOVE` on the Track item (`trackName` required; `genre`/`description` cleared when absent; `clearedImage` removes image fields)
4. Read back via base-table `GetItem` (not the GSI — eventual consistency) + owner profile → `Track`

#### `POST /tracks/{trackId}/share` — ShareTrackLambda
Owner-only (404 otherwise). `{add: [], remove: [], caption?}`, max 50 direct recipients.
1. Track fetch → owner check
2. `Query(PK=TRACK#{id}, SK begins_with SHARED#)` **excluding `#ALBUM#` grant records** → current direct recipients
3. Validate adds: `GetValidatedRecipientsAsync` (strips self, dupes, unknown users, and recipients whose `incomingShares` setting blocks the sender — `FOLLOWING` checks `Query(PK=FOLLOW#{sender}, begins_with USER#{recipient}#)` per candidate)
4. **BatchWrite**: put SharedTrack items for adds (`GSI1SK=DATE#{now}`, `GSI2SK=SENDER#{owner}#DATE#{now}`), delete direct-share items for removes — album grant records are never touched, so album-derived access survives. The same batch writes feed items and activity items (see [feed.md](feed.md) and [activity.md](activity.md))

#### `GET /tracks/{trackId}/recipients` — GetTrackRecipientsLambda
Owner-only (404 otherwise). `Query(PK=TRACK#{id}, begins_with SHARED#)` filtered to direct shares (drops `#ALBUM#` grant SKs) → BatchGet profiles → `{items:[{user, sharedAt}]}` newest-first. Bounded, no pagination.

#### `GET /tracks/{trackId}/segments` — GetTrackSegmentsLambda
1. Track fetch (GSI1 by-id) → **access check** (owner OR `IsTrackAccessibleToUser`) — 404 otherwise
2. Presign one GET URL per segment (`processed/{trackId}/segment_{i}.mp3`, private bucket, 1h expiry) → `{urls, expiresAt, duration}`

#### `GET /tracks/uploads/{trackId}` — GetUploadStatusLambda
1. `GetItem(PK=USER#{requestor}, SK=UPLOAD#{trackId})` → `{trackId, status, error?, createdAt}` (404 if absent/expired)

#### `DELETE /tracks/{trackId}` — DeleteTrackLambda
Owner-only (404 otherwise). Ordered so any mid-delete crash is retryable (track stays fetchable until the last step):
1. Track fetch → owner check
2. For each of the owner's albums: `GetItem(ALBUM#{albumId}, TRACK#{trackId})` → if a member, `RemoveTracksAsync` (revokes that album's per-recipient grants, then the membership)
3. Delete S3 objects: `processed/{trackId}/segment_{i}.mp3` (private bucket) + cover (public bucket)
4. `Query(PK=TRACK#{trackId}, SK begins_with SHARED#)` + `begins_with LIKE#` → batch-delete direct shares (and their feed items), leftover grants, likes, and the `UPLOAD#{trackId}` status record
5. Delete the Track item (`USER#{owner}`, `TRACK#{trackId}`) last

Playlist membership records referencing the track (any user's — not enumerable by track) are left dangling; playlist reads surface them as removable placeholders (see [playlists.md](playlists.md)).

### Like APIs

#### `POST /tracks/{trackId}/like` — LikeTrackLambda
Request body: `{newValue: true|false}` (mirrors follow-user)
1. Track fetch via GSI1 → 404 if missing; like requires access (owner/direct/album-grant), unlike always allowed
2. Read-before-write: `GetItem(PK=TRACK#{id}, SK=LIKE#{requestor})` — no-op if state already matches (idempotent; protects `likeCount`)
3. **TransactWrite** (3–4 parts): save/delete Like item + `ADD likeCount :±1` on the Track item + `ADD trackCount :±1, totalDurationSeconds :±duration` on the requestor's likes-playlist meta + (on a non-self like) a `TRACK_LIKED` activity item for the owner (see [activity.md](activity.md))

#### `GET /tracks/{trackId}/likes` — GetTrackLikesLambda
Owner-only (404 otherwise)
1. Track fetch → owner check
2. `Query(PK=TRACK#{id}, begins_with LIKE#, Limit=25, cursor)` → like records
3. `BatchGet` liker profiles → `{likeCount, items: [{user, likedAt}], nextCursor}`
