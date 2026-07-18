# Albums

Part of the [data model](README.md). Albums contain only the owner's own tracks and are the bulk-sharing mechanism. See [fan-out writes](README.md#fan-out-writes-albumrepository) and the [track access rule](README.md#track-access-rule).

## Item Types & Key Schema

### Album (meta)

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `USER#{ownerUsername}` | `ALBUM#{albumId}` | `ALBUM#{albumId}` | `INFO` | `ALBUMS#{ownerUsername}` | `DATE#{createdAt}` |

Attributes: `name`, `description`, `imageUrl`, `imageBgColor`, `trackCount`, `totalDurationSeconds`, `shareCount`, `likeCount` (share/like counts owner-only in responses; `likedByMe` added per-viewer), `createdAt`

GSI1 mirrors the Track pattern for by-id lookup (recipients don't know the owner); GSI3 gives the owner's paginated listing newest-first.

### Album Track (membership — owner's own tracks only)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `ALBUM#{albumId}` | `TRACK#{trackId}` | `ALBUM#{albumId}` | `ORDER#{rank}` |

Attributes: `trackOwnerUsername` (= album owner), `duration` (denormalized so removals reconcile `totalDurationSeconds`), `addedAt`

Shares the `ALBUM#{albumId}` GSI1 partition with the meta row (`INFO` vs `ORDER#…`). Same rank scheme as playlist tracks.

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

### Album Like

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `ALBUM#{albumId}` | `LIKE#{username}` | `ALBUMLIKES#{username}` | `DATE#{epochMs}` |

Attributes: `albumOwnerUsername`, `likedAt`

Mirrors the track like exactly: base key lets the owner query who liked; GSI1 gives the user's liked-albums feed. `likeCount` on the album meta is maintained via `ADD` counter transactions with read-before-write idempotency (`AlbumLikeRepository`). Deleted with the album.

---

## Access Patterns

### Album APIs

#### `POST /albums` — CreateAlbumLambda
Request body: `{name, description?, imageKey?, trackIds?}` (≤50 tracks)
1. Own-tracks-only: `BatchGet(PK=USER#{requestor}, SK=TRACK#{id})` for every id — any miss → 400
2. Optional `imageKey` → ImageService: process staged image to `albums/{id}/cover_400x400.jpg` (public bucket) + dominant color — before any write, so a bad image 400s cleanly
3. **BatchWrite** memberships first, then meta (`SaveAsync`) — album only becomes visible once fully written → 201

#### `GET /albums` — GetAlbumsLambda
1. `Query(GSI3, GSI3PK=ALBUMS#{requestor}, GSI3SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → own albums newest-first, paginated

#### `GET /albums/{albumId}` — GetAlbumLambda
1. `Query(GSI1, GSI1PK=ALBUM#{id}, GSI1SK=INFO)` → meta or 404
2. Access: owner, or `GetItem(PK=ALBUM#{id}, SK=SHARED#{requestor})` — no per-track checks needed (all tracks are the owner's; access derives from the album share). Sets `likedByMe`; share/like counts owner-only.
3. `Query(GSI1, GSI1PK=ALBUM#{id}, begins_with ORDER#, ascending, Limit=10, cursor)` + `TrackBatchLookup` join → meta + paginated tracks

#### `GET /albums/{albumId}/recipients` — GetAlbumRecipientsLambda
Owner-only (404 otherwise). `Query(PK=ALBUM#{id}, begins_with SHARED#)` → BatchGet recipient profiles → `{items:[{user, sharedAt}]}` newest-first. Bounded (≤50), no pagination.

#### `PUT /albums/{albumId}` — UpdateAlbumLambda / `DELETE /albums/{albumId}` — DeleteAlbumLambda
Owner-only (404 otherwise). Update: optional `imageKey` cover processing / `clearedImage` removal, then UpdateExpression on name/description/image.
Delete order (revoke-first): album likes → cover image (public bucket, if set) → grants (`PK=TRACK#{tid}, SK=SHARED#{recipient}#ALBUM#{id}` for every track × recipient) → AlbumShare records (and their feed items) → memberships → meta. All via **BatchWrite**.

#### `PUT /albums/{albumId}/tracks` — SetAlbumTracksLambda
Declarative save from the edit-tracks screen: `{trackIds: [...]}` (≤50, all owner's own tracks, empty list clears the album) **becomes** the tracklist in that order — the album's only track-editing endpoint. Last-write-wins on concurrent edits.
1. Owner check → 404; validation: ids lowercased + deduped, cap, own-tracks-only (`GetOwnedTrackIdsAsync` miss → 400)
2. Diff against current memberships: revoke grants for dropped tracks first, then write grants for new tracks (every track × existing recipient)
3. **BatchWrite** memberships: delete dropped + put the full ordered list with fresh ranks 10/20/30… (kept members re-ranked only — `addedAt`/denormalized duration preserved); `trackCount`/`totalDurationSeconds` counters adjusted by the diff

#### `POST /albums/{albumId}/share` — ShareAlbumLambda
Request body: `{add: [users], remove: [users]}` — owner-only; recipients validated via `GetValidatedRecipientsAsync` (strips self/unknown/dupes + enforces each recipient's `incomingShares` setting); ≤50 recipients
1. Removes: delete grants (every track × removed user) first, then AlbumShare records (and their feed items)
2. Adds: write grants (every track × added user) first, then AlbumShare records (the share record is the authoritative marker), plus feed items and `ALBUM_SHARED` activity per recipient
3. `shareCount` adjusted

### Album Like APIs

#### `POST /albums/{albumId}/like` — LikeAlbumLambda
`{newValue}`; liking gated on owner-or-recipient (`IsAlbumSharedWithUserAsync`), unliking always allowed. Idempotent like/unlike with `ADD likeCount :±1` (read-before-write).

#### `GET /albums/{albumId}/likes` — GetAlbumLikesLambda (owner-only)
`Query(PK=ALBUM#{id}, begins_with LIKE#, cursor)` → BatchGet liker profiles → `PaginatedResult<AlbumLiker>`.

#### `GET /albums/liked` — GetLikedAlbumsLambda
`Query(GSI1, GSI1PK=ALBUMLIKES#{requestor}, begins_with DATE#, cursor)` → BatchGet album metas + owners → `PaginatedResult<Album>` (likedByMe=true; likeCount only when requestor owns the album).

#### `GET /albums/shared` — GetAlbumsSharedWithMeLambda
1. `Query(GSI1, GSI1PK=ALBUMSHARED#{requestor}, begins_with DATE#, Limit=10, cursor)` → AlbumShare records
2. Parallel BatchGet album metas (via `albumOwnerUsername`) + owner profiles → `PaginatedResult<SharedAlbum>` (share/like counts nulled for the recipient viewer)
