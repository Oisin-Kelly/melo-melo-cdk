# DynamoDB Access Patterns

Table: `melo-melo-table-{env}` | Keys: `PK` (hash), `SK` (range)
Index: `GSI1` — `GSI1PK` (hash), `GSI1SK` (range), projection ALL
Index: `GSI2` — `GSI1PK` (hash), `GSI2SK` (range), projection ALL
Index: `GSI3` — `GSI3PK` (hash), `GSI3SK` (range), projection ALL

---

## Item Types & Key Schema

### User Profile

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `USER#{username}` | `PROFILE` | `EMAIL#{email}` | `PROFILE` |

Attributes: `username`, `displayName`, `firstName`, `lastName`, `country`, `city`, `bio`, `imageUrl`, `imageBgColor`, `followingCount`, `followerCount`, `followingsPrivate`, `followersPrivate`, `incomingShares` (`EVERYONE` — default, may be absent — | `FOLLOWING` | `NONE`), `createdAt`

### Track

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `USER#{ownerUsername}` | `TRACK#{trackId}` | `TRACK#{trackId}` | `INFO` | `USER#{ownerUsername}` | `DATE#{createdAt}` |

Attributes: `trackName`, `description`, `genre`, `imageUrl`, `imageBgColor`, `createdAt`, `duration`, `segments`

Derived: `OwnerUsername` from `PK.Replace("USER#", "")`, `TrackId` from `SK.Replace("TRACK#", "")`

GSI1 gives by-id lookup (owner unknown at query time); GSI3 gives the owner's tracks newest-first (base-table SK order is random GUID order, so it can't serve a chronological listing).

### Upload Status

| PK | SK |
|----|-----|
| `USER#{username}` | `UPLOAD#{trackId}` |

Attributes: `status` (`PROCESSING` / `COMPLETE` / `FAILED`), `error`, `createdAt`, `expiresAt` (table TTL attribute — records self-expire after 24h). No GSI keys — only ever fetched point-wise by the owner.

Written by `UploadTrackLambda` (PROCESSING, before starting the state machine), finalized by `ProcessTrackLambda` (COMPLETE, or FAILED with a user-safe reason from its catch block).

### Follow Relationship

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `FOLLOW#{usernameBeingFollowed}` | `USER#{followerUsername}#{epochMs}` | `FOLLOWING#{followerUsername}` | `DATE#{epochMs}#TARGET#{usernameBeingFollowed}` |

Attributes: `createdAt`

SK includes epoch timestamp for chronological sorting on base table (newest followers first).
GSI1SK includes epoch timestamp for chronological sorting in GSI1 (newest followings first).

### Shared Track

| PK | SK | GSI1PK | GSI1SK | GSI2SK |
|----|-----|--------|--------|--------|
| `TRACK#{trackId}` | `SHARED#{recipientUserId}` | `SHARED#{recipientUserId}` | `DATE#{epochMs}` | `SENDER#{senderUserId}#DATE#{epochMs}` |

Attributes: `caption`, `sharedAt`, `trackOwnerUsername`

GSI1SK is a date prefix for chronological feed sorting (GSI1).
GSI2SK is a sender+date prefix for per-sender filtered sorting (GSI2). Both GSI1 and GSI2 share GSI1PK as the hash key.
`trackOwnerUsername` is stored for efficient BatchGet without parsing sort keys.

### Playlist (meta)

| PK | SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|
| `USER#{username}` | `PLAYLIST#{playlistId}` | `PLAYLISTS#{username}` | `DATE#{createdAt}` |

Attributes: `name`, `description`, `type` (`LIKES` \| `CUSTOM`), `imageUrl`, `imageBgColor`, `createdAt`

The built-in likes playlist uses the reserved id `likes` (created at PostConfirmation). Custom playlist ids are server-generated lowercase GUIDs. GSI3 gives the owner's paginated listing newest-first; the likes playlist carries the sentinel sort key `DATE#9999999999999` so it always sorts first on page 1.

### Playlist Track (custom-playlist membership)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `PLAYLIST#{playlistId}` | `TRACK#{trackId}` | `PLAYLIST#{playlistId}` | `DATE#{epochMs}` |

Attributes: `trackOwnerUsername`, `addedAt`

Base key gives point add/remove/dedup (re-adding overwrites and bumps to top); GSI1 gives chronological paging.

### Like (likes-playlist membership, stored track-side)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `TRACK#{trackId}` | `LIKE#{username}` | `LIKES#{username}` | `DATE#{epochMs}` |

Attributes: `trackOwnerUsername`, `likedAt`

Track-side base key lets the owner query who liked; GSI1 gives the user's liked-tracks feed. The Track item carries a `likeCount` attribute maintained transactionally (`ADD likeCount :±1`) with like/unlike writes; read-before-write makes the toggle idempotent.

### Album (meta)

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `USER#{ownerUsername}` | `ALBUM#{albumId}` | `ALBUM#{albumId}` | `INFO` | `ALBUMS#{ownerUsername}` | `DATE#{createdAt}` |

Attributes: `name`, `description`, `imageUrl`, `imageBgColor`, `createdAt`

GSI1 mirrors the Track pattern for by-id lookup (recipients don't know the owner); GSI3 gives the owner's paginated listing newest-first.

### Album Track (membership — owner's own tracks only)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `ALBUM#{albumId}` | `TRACK#{trackId}` | `ALBUM#{albumId}` | `DATE#{epochMs}` |

Attributes: `trackOwnerUsername` (= album owner), `addedAt`

Shares the `ALBUM#{albumId}` GSI1 partition with the meta row (`INFO` vs `DATE#…`).

### Album Share (per recipient)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `ALBUM#{albumId}` | `SHARED#{recipient}` | `ALBUMSHARED#{recipient}` | `DATE#{epochMs}` |

Attributes: `albumOwnerUsername`, `sharedAt`

GSI1 gives the "albums shared with me" feed.

### Album Track Grant (derived access, per track × recipient × album)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `TRACK#{trackId}` | `SHARED#{recipient}#ALBUM#{albumId}` | — | — |

Attributes: `trackOwnerUsername`, `albumId`, `grantedAt`

**Deliberately no GSI attributes** — grants must never appear in the direct-share feeds. A grant coexists with a direct `SHARED#{recipient}` item on the same track partition (distinct SKs); album operations only ever touch `…#ALBUM#{albumId}` keys, so direct shares always survive album unshare/removal/deletion.

**Track access rule** (used by GetTrack, LikeTrack, playlist reads): requestor is owner, OR `GetItem(PK=TRACK#{id}, SK=SHARED#{user})` exists, OR `Query(PK=TRACK#{id}, SK begins_with SHARED#{user}#ALBUM#)` returns an item — the last two run in parallel (`ISharedTrackRepository.IsTrackAccessibleToUser`). The two lookups must stay separate: `begins_with SHARED#{user}` alone would prefix-match other usernames (`bob` → `bobby`).

**Fan-out writes** (`AlbumRepository`): share/unshare/add/remove/delete operations write or delete N recipients × M tracks grant items via `IDynamoDBService` batch writes (SDK chunks to 25 and retries unprocessed items). Ordering rule for crash-safety: mutate grant records first, the authoritative record (AlbumShare / membership / meta) last, so retrying a failed operation converges and a completed unshare never leaves hidden access. Limits: 50 tracks and 50 recipients per album.

---

## Access Patterns by API

### Cognito Triggers (no HTTP route)

#### PostConfirmationLambda — Create user on signup
- **Trigger:** Cognito `PostConfirmation_ConfirmSignUp`
- **TransactWrite** (2 parts, atomic):
  - User profile: `PK=USER#{username}`, `SK=PROFILE`, `GSI1PK=EMAIL#{email}`, `GSI1SK=PROFILE`
  - Likes playlist meta: `PK=USER#{username}`, `SK=PLAYLIST#likes`, `type=LIKES`, `name="Likes"`
- Default values: `displayName=username`, `bio="Hey! I'm using MeloMelo!"`, counts=0, privacy=false, `incomingShares=EVERYONE`

#### CheckEmailExistenceLambda — Validate email uniqueness on pre-signup
- **Trigger:** Cognito `PreSignUp`
- **No DynamoDB access** — validates via Cognito `ListUsers` API with email filter
- Also validates username format via regex: `^[a-zA-Z0-9._]{2,30}$`

---

### User APIs

#### `GET /users/{username}` — GetUserLambda
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → returns User or 404

#### `POST /profile/update` — UpdateUserProfileLambda
1. If `imageKey` provided: fetch image from S3 Dropbox bucket, resize to 400x400, upload to Public bucket as `users/{username}/profile_400x400.jpg`, extract dominant color
2. `TransactWrite` with `UpdateExpression` on `PK=USER#{username}, SK=PROFILE`
   - Uses `SET` for provided fields, `REMOVE` for cleared fields
   - `UpdateExpressionBuilder` generates expression dynamically
3. `GetItem(PK=USER#{username}, SK=PROFILE)` → returns updated User

---

### Follow APIs

#### `GET /users/{username}/follow-status` — IsFollowingUserLambda
1. `GetItem(PK=FOLLOW#{username}, SK=USER#{requestor})` → returns `{followStatus: bool, createdAt}`

#### `POST /users/{username}/follow-user` — FollowUserLambda
Request body: `{newValue: true|false}`

**Follow** (`newValue: true`):
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → verify target user exists
2. **TransactWrite** (3 parts, atomic):
   - `Save` follow record: `PK=FOLLOW#{username}, SK=USER#{requestor}#{epochMs}, GSI1PK=FOLLOWING#{requestor}, GSI1SK=DATE#{epochMs}#TARGET#{username}`
   - `Update` target user: `ADD followerCount :1` on `PK=USER#{username}, SK=PROFILE`
   - `Update` requestor: `ADD followingCount :1` on `PK=USER#{requestor}, SK=PROFILE`

**Unfollow** (`newValue: false`):
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → verify target user exists
2. `Query(PK=FOLLOW#{username}, SK begins_with USER#{requestor}#)` → find exact follow record SK (timestamp unknown at unfollow time)
3. **TransactWrite** (3 parts, atomic):
   - `Delete` follow record using exact PK+SK from step 2
   - `Update` target user: `ADD followerCount :-1` on `PK=USER#{username}, SK=PROFILE`
   - `Update` requestor: `ADD followingCount :-1` on `PK=USER#{requestor}, SK=PROFILE`

#### `GET /users/{username}/followers` — GetUserFollowersLambda
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → check user exists + `followersPrivate` flag
2. `Query(PK=FOLLOW#{username}, SK begins_with USER#, Limit=10, ScanIndexForward=false, cursor)` → paginated follow records newest-first
3. Extract follower username from SK: `USER#{followerUsername}#{epochMs}` → `split('#')[1]`
4. `BatchGet` each follower's profile → returns `PaginatedResult<User>`

#### `GET /users/{username}/followings` — GetUserFollowingLambda
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → check user exists + `followingsPrivate` flag
2. `Query(GSI1, GSI1PK=FOLLOWING#{username}, GSI1SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated following records newest-first
3. Extract followed username from GSI1SK: `DATE#{epochMs}#TARGET#{targetUsername}` → `split("#TARGET#")[1]`
4. `BatchGet` each followed user's profile → returns `PaginatedResult<User>`

#### `GET /users/{username}/follow-status` — IsFollowingUserLambda
1. `Query(PK=FOLLOW#{username}, SK begins_with USER#{requestor}#)` → check if follow record exists (1 item max)

---

### Track APIs

#### `GET /tracks/{trackId}` — GetTrackLambda
1. `Query(GSI1, GSI1PK=TRACK#{trackId}, GSI1SK=INFO)` → get TrackDataModel (owner unknown at query time, need GSI)
2. `GetItem(PK=USER#{ownerUsername}, SK=PROFILE)` → get track owner's profile
3. If not owner, **parallel access check**: `GetItem(PK=TRACK#{trackId}, SK=SHARED#{requestor})` (direct share) + `Query(PK=TRACK#{trackId}, SK begins_with SHARED#{requestor}#ALBUM#)` (album grant) — 404 if neither
4. `GetItem(PK=TRACK#{trackId}, SK=LIKE#{requestor})` → sets `likedByMe`; `likeCount` returned to the owner only

#### `GET /tracks/shared` — GetTracksSharedWithUserLambda
1. `Query(GSI1, GSI1PK=SHARED#{requestor}, GSI1SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated shared items newest-first
2. **Parallel BatchGet** (two concurrent calls):
   - Tracks: `BatchGet(PK=USER#{item.TrackOwnerUsername}, SK=item.Pk)` for each shared item
   - Owners: `BatchGet(PK=USER#{item.TrackOwnerUsername}, SK=PROFILE)` for each unique owner (deduplicated)
3. In-memory join: match tracks to owners → returns `PaginatedResult<SharedTrack>`

#### `GET /users/{username}/shared` — GetTracksSharedFromUserLambda
1. `Query(GSI2, GSI1PK=SHARED#{requestor}, GSI2SK begins_with SENDER#{username}#, Limit=10, ScanIndexForward=false, cursor)` → paginated shared items from specific sender newest-first
2. Same parallel BatchGet + join as above → returns `PaginatedResult<SharedTrack>`

#### `DELETE /tracks/{trackId}` — DeleteTrackLambda
Owner-only (404 otherwise). Ordered so any mid-delete crash is retryable (track stays fetchable until the last step):
1. Track fetch → owner check
2. For each of the owner's albums: `GetItem(ALBUM#{albumId}, TRACK#{trackId})` → if a member, `RemoveTracksAsync` (revokes that album's per-recipient grants, then the membership)
3. Delete S3 objects: `processed/{trackId}/segment_{i}.mp3` (private bucket) + cover (public bucket)
4. `Query(PK=TRACK#{trackId}, SK begins_with SHARED#)` + `begins_with LIKE#` → batch-delete direct shares, leftover grants, likes, and the `UPLOAD#{trackId}` status record
5. Delete the Track item (`USER#{owner}`, `TRACK#{trackId}`) last

Playlist membership records referencing the track (any user's — not enumerable by track) are left dangling; playlist reads drop unresolvable tracks.

#### `GET /tracks/{trackId}/segments` — GetTrackSegmentsLambda
1. Track fetch (GSI1 by-id) → **access check** (owner OR `IsTrackAccessibleToUser`) — 404 otherwise
2. Presign one GET URL per segment (`processed/{trackId}/segment_{i}.mp3`, private bucket, 1h expiry) → `{urls, expiresAt, duration}`

#### `GET /tracks/uploads/{trackId}` — GetUploadStatusLambda
1. `GetItem(PK=USER#{requestor}, SK=UPLOAD#{trackId})` → `{trackId, status, error?, createdAt}` (404 if absent/expired)

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
3. Validate adds: `GetValidatedRecipientsAsync` (strips self, dupes, unknown users, and recipients whose `incomingShares` setting blocks the sender — `FOLLOWING` checks `GetItem`-style `Query(PK=FOLLOW#{sender}, begins_with USER#{recipient}#)` per candidate)
4. **BatchWrite**: put SharedTrack items for adds (`GSI1SK=DATE#{now}`, `GSI2SK=SENDER#{owner}#DATE#{now}`), delete direct-share items for removes — album grant records are never touched, so album-derived access survives

#### `GET /tracks` — GetUserTracksLambda
1. `Query(GSI3, GSI3PK=USER#{requestor}, GSI3SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated track items newest-first
2. Fetch owner profile once: `GetItem(PK=USER#{requestor}, SK=PROFILE)` → returns `PaginatedResult<Track>`

---

### Playlist APIs

#### `POST /playlists` — CreatePlaylistLambda
1. Optional `imageKey` → ImageService: process staged image to `playlists/{id}/cover_400x400.jpg` (public bucket) + dominant color — before any write, so a bad image 400s cleanly
2. `SaveAsync(PlaylistDataModel)` — `PK=USER#{requestor}, SK=PLAYLIST#{guid}`, `type=CUSTOM` (server-generated id, type never client-controlled) → 201

#### `GET /playlists` — GetPlaylistsLambda
1. `Query(GSI3, GSI3PK=PLAYLISTS#{requestor}, GSI3SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated metas; likes' sentinel sort key puts it first, then customs newest-first

#### `GET /playlists/{playlistId}` — GetPlaylistLambda
1. `GetItem(PK=USER#{requestor}, SK=PLAYLIST#{id})` → meta or 404
2. Likes: `Query(GSI1, GSI1PK=LIKES#{requestor}, begins_with DATE#, Limit=10, cursor)`; Custom: `Query(GSI1, GSI1PK=PLAYLIST#{id}, begins_with DATE#, Limit=10, cursor)`
3. `TrackBatchLookup`: parallel BatchGet tracks + unique owner profiles, join
4. Per-item parallel access check (owner/direct/album-grant); inaccessible tracks are dropped from the page

#### `PUT /playlists/{playlistId}` — UpdatePlaylistLambda
1. Meta get → 404 if missing, 400 if `LIKES`
2. Optional `imageKey` → ImageService cover processing (as create); `clearedImage` → REMOVE image attributes
3. `TransactWrite` UpdateExpression (`UpdateExpressionBuilder`) on name/description/image → returns updated playlist

#### `DELETE /playlists/{playlistId}` — DeletePlaylistLambda
1. Meta get → 404 if missing, 400 if `LIKES`
2. Delete `playlists/{id}/cover_400x400.jpg` from the public bucket if set
3. `Query(PK=PLAYLIST#{id}, begins_with TRACK#)` → all memberships; **BatchWrite delete** memberships first, meta last (retryable while meta exists)

#### `POST /playlists/{playlistId}/tracks` — ModifyPlaylistTracksLambda
Request body: `{add: [trackIds], remove: [trackIds]}` (≤50 each; 400 for the likes playlist — use the like endpoint)
1. Meta get → 404/400 checks
2. Per added id: track fetch + access check (owner/direct/album-grant) — any inaccessible id → 400
3. **BatchWrite**: put memberships (`PK=PLAYLIST#{id}, SK=TRACK#{trackId}`, GSI1 date) + delete removals in parallel

---

### Like APIs

#### `POST /tracks/{trackId}/like` — LikeTrackLambda
Request body: `{newValue: true|false}` (mirrors follow-user)
1. Track fetch via GSI1 → 404 if missing; like requires access (owner/direct/album-grant), unlike always allowed
2. Read-before-write: `GetItem(PK=TRACK#{id}, SK=LIKE#{requestor})` — no-op if state already matches (idempotent; protects `likeCount`)
3. **TransactWrite** (2 parts): save/delete Like item + `ADD likeCount :±1` on the Track item

#### `GET /tracks/{trackId}/likes` — GetTrackLikesLambda
Owner-only (404 otherwise)
1. Track fetch → owner check
2. `Query(PK=TRACK#{id}, begins_with LIKE#, Limit=25, cursor)` → like records
3. `BatchGet` liker profiles → `{likeCount, items: [{user, likedAt}], nextCursor}`

---

### Album APIs

#### `POST /albums` — CreateAlbumLambda
Request body: `{name, description?, imageKey?, trackIds?}` (≤50 tracks)
1. Own-tracks-only: `BatchGet(PK=USER#{requestor}, SK=TRACK#{id})` for every id — any miss → 400
2. Optional `imageKey` → ImageService: process staged image to `albums/{id}/cover_400x400.jpg` (public bucket) + dominant color — before any write, so a bad image 400s cleanly
3. **BatchWrite** memberships first, then meta (`SaveAsync`) — album only becomes visible once fully written → 201

#### `GET /albums` — GetAlbumsLambda
1. `Query(GSI3, GSI3PK=ALBUMS#{requestor}, GSI3SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → own albums newest-first, paginated

#### `GET /albums/shared` — GetAlbumsSharedWithMeLambda
1. `Query(GSI1, GSI1PK=ALBUMSHARED#{requestor}, begins_with DATE#, Limit=10, cursor)` → AlbumShare records
2. Parallel BatchGet album metas (via `albumOwnerUsername`) + owner profiles → `PaginatedResult<SharedAlbum>`

#### `GET /albums/{albumId}` — GetAlbumLambda
1. `Query(GSI1, GSI1PK=ALBUM#{id}, GSI1SK=INFO)` → meta or 404
2. Access: owner, or `GetItem(PK=ALBUM#{id}, SK=SHARED#{requestor})` — no per-track checks needed (all tracks are the owner's; access derives from the album share)
3. `Query(GSI1, GSI1PK=ALBUM#{id}, begins_with DATE#, Limit=10, cursor)` + `TrackBatchLookup` join → meta + paginated tracks

#### `PUT /albums/{albumId}` — UpdateAlbumLambda / `DELETE /albums/{albumId}` — DeleteAlbumLambda
Owner-only (404 otherwise). Update: optional `imageKey` cover processing / `clearedImage` removal, then UpdateExpression on name/description/image.
Delete order (revoke-first): cover image (public bucket, if set) → grants (`PK=TRACK#{tid}, SK=SHARED#{recipient}#ALBUM#{id}` for every track × recipient) → AlbumShare records → memberships → meta. All via **BatchWrite**.

#### `POST /albums/{albumId}/tracks` — ModifyAlbumTracksLambda
Request body: `{add, remove}` — owner-only; adds must be own tracks; total ≤50
1. Adds: write grants for every existing recipient first, memberships last
2. Removes: delete grants first, memberships last

#### `POST /albums/{albumId}/share` — ShareAlbumLambda
Request body: `{add: [users], remove: [users]}` — owner-only; recipients validated via `GetValidatedRecipientsAsync` (strips self/unknown/dupes + enforces each recipient's `incomingShares` setting); ≤50 recipients
1. Removes: delete grants (every track × removed user) first, then AlbumShare records
2. Adds: write grants (every track × added user) first, then AlbumShare records (the share record is the authoritative marker)
