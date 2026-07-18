# Playlists

Part of the [data model](README.md). Custom playlists and the built-in likes playlist. Playlists are always private to their owner. Playlist reads use the [track access rule](README.md#track-access-rule).

## Item Types & Key Schema

### Playlist (meta)

| PK | SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|
| `USER#{username}` | `PLAYLIST#{playlistId}` | `PLAYLISTS#{username}` | `DATE#{createdAt}` |

Attributes: `name`, `description`, `type` (`LIKES` \| `CUSTOM`), `imageUrl`, `imageBgColor`, `trackCount`, `totalDurationSeconds`, `createdAt`. On the likes playlist (written as 0/0 at PostConfirmation) the counters are maintained by the like/unlike transaction rather than the track-editing endpoints — see [tracks.md](tracks.md).

The built-in likes playlist uses the reserved id `likes` (created at PostConfirmation). Custom playlist ids are server-generated lowercase GUIDs. GSI3 gives the owner's paginated listing newest-first; the likes playlist carries the sentinel sort key `DATE#9999999999999` so it always sorts first on page 1.

### Playlist Track (custom-playlist membership)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `PLAYLIST#{playlistId}` | `TRACK#{trackId}` | `PLAYLIST#{playlistId}` | `ORDER#{rank}` |

Attributes: `trackOwnerUsername`, `duration`, `trackName` (denormalized so a dead-track placeholder can still render its name/duration), `addedAt`

Base key gives point add/remove/dedup (re-adding an existing member is a no-op — position and `addedAt` are kept); GSI1 gives explicit-order paging. Ranks are zero-padded ints spaced 10 apart (`MembershipRank`); single adds append at max+10, the declarative `PUT /playlists/{id}/tracks` save rewrites ranks to 10/20/30… in list order (which also resets rank-space growth). The rank attribute is required because Query sorts only by sort key, so order must be encoded explicitly.

---

## Access Patterns

### Playlist APIs

#### `POST /playlists` — CreatePlaylistLambda
1. Optional `imageKey` → ImageService: process staged image to `playlists/{id}/cover_400x400.jpg` (public bucket) + dominant color — before any write, so a bad image 400s cleanly
2. `SaveAsync(PlaylistDataModel)` — `PK=USER#{requestor}, SK=PLAYLIST#{guid}`, `type=CUSTOM` (server-generated id, type never client-controlled) → 201

#### `GET /playlists` — GetPlaylistsLambda
1. `Query(GSI3, GSI3PK=PLAYLISTS#{requestor}, GSI3SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated metas; likes' sentinel sort key puts it first, then customs newest-first

#### `GET /playlists/{playlistId}` — GetPlaylistLambda
Returns `{playlist, tracks}` where `tracks.items` are `PlaylistTrackEntry` (available entries carry the full `track`).
1. `GetItem(PK=USER#{requestor}, SK=PLAYLIST#{id})` → meta or 404
2. Likes: `Query(GSI1, GSI1PK=LIKES#{requestor}, begins_with DATE#, Limit=10, cursor)` (like history order); Custom: `Query(GSI1, GSI1PK=PLAYLIST#{id}, begins_with ORDER#, ascending, Limit=10, cursor)`
3. `TrackBatchLookup`: parallel BatchGet tracks + unique owner profiles, join → `PlaylistTrackEntry` per membership (a BatchGet miss → `unavailable`, reason `DELETED`, rendered from the denormalized name/duration)
4. Per-item parallel access check (owner/direct/album-grant); an entry whose owner lost access is downgraded to `unavailable`, reason `REVOKED` (kept as a removable placeholder, not dropped). The likes playlist has no denormalized name, so deleted/inaccessible liked tracks are simply dropped (still access-filtered).

#### `PUT /playlists/{playlistId}` — UpdatePlaylistLambda
1. Meta get → 404 if missing, 400 if `LIKES`
2. Optional `imageKey` → ImageService cover processing (as create); `clearedImage` → REMOVE image attributes
3. `TransactWrite` UpdateExpression (`UpdateExpressionBuilder`) on name/description/image → returns updated playlist

#### `DELETE /playlists/{playlistId}` — DeletePlaylistLambda
1. Meta get → 404 if missing, 400 if `LIKES`
2. Delete `playlists/{id}/cover_400x400.jpg` from the public bucket if set
3. `Query(PK=PLAYLIST#{id}, begins_with TRACK#)` → all memberships; **BatchWrite delete** memberships first, meta last (retryable while meta exists)

#### `POST /playlists/{playlistId}/tracks/{trackId}` — AddPlaylistTrackLambda
Adds one track (the "add to playlist" gesture). 400 for the likes playlist — use the like endpoint.
1. Meta get → 404/400 checks
2. Track fetch + access check (owner/direct/album-grant) — inaccessible → 400
3. `GetItem` membership: already a member → no-op (`added: false`; position and `addedAt` kept). Otherwise put membership (`PK=PLAYLIST#{id}, SK=TRACK#{trackId}`, GSI1 rank = current max + 10, `addedAt` = now) + counters +1/+duration

#### `DELETE /playlists/{playlistId}/tracks/{trackId}` — RemovePlaylistTrackLambda
Removes one track. Idempotent (`removed: false` when it wasn't a member). Deliberately **no track-access check** — revoked/deleted placeholders must stay removable. 400 for the likes playlist.
1. Meta get → 404/400 checks
2. `GetItem` membership → delete + counters −1/−duration (denormalized, so dangling entries reconcile)

#### `PUT /playlists/{playlistId}/tracks` — SetPlaylistTracksLambda
Declarative save from the edit screen: `{trackIds: [...]}` (≤500) **becomes** the playlist in that order. Reorder + remove only — every id must be a current member (400 otherwise; adds go through the POST so `addedAt` stays honest). Members missing from the list are removed. Last-write-wins on concurrent edits.
1. Meta get → 404/400 checks (400 for the likes playlist — like-history order is fixed)
2. `Query(PK=PLAYLIST#{id}, begins_with TRACK#)` → current memberships; unknown submitted id → 400
3. **BatchWrite**: re-put kept memberships with fresh ranks 10/20/30… in list order (`addedAt`/denormalized fields preserved) + delete omitted members; counters adjusted for removals only

