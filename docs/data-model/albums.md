# Albums

Part of the [data model](README.md). Albums contain only the owner's own tracks and are the bulk-sharing mechanism. See [fan-out writes](README.md#fan-out-writes-albumrepository) and the [track access rule](README.md#track-access-rule).

## Item Types & Key Schema

### Album (meta)

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `USER#{ownerUsername}` | `ALBUM#{albumId}` | `ALBUM#{albumId}` | `INFO` | `ALBUMS#{ownerUsername}` | `DATE#{createdAt}` |

Attributes: `name`, `description`, `slug` (canonical readable URL — [README.md](README.md#readable-urls-slugs)), `imageUrl`, `imageBgColor`, `trackCount`, `totalDurationSeconds`, `shareCount`, `likeCount` (share/like counts owner-only in responses; `likedByMe` added per-viewer), `createdAt`

GSI1 mirrors the Track pattern for by-id lookup (recipients don't know the owner); GSI3 gives the owner's paginated listing newest-first.

### Album Track (membership — owner's own tracks only)

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `ALBUM#{albumId}` | `TRACK#{trackId}` | `ALBUM#{albumId}` | `ORDER#{rank}` |

Attributes: `trackOwnerUsername` (= album owner), `duration` (denormalized so removals reconcile `totalDurationSeconds`), `addedAt`

Shares the `ALBUM#{albumId}` GSI1 partition with the meta row (`INFO` vs `ORDER#…`). Same rank scheme as playlist tracks.

### Album Share (per recipient)

| PK | SK | GSI1PK | GSI1SK | GSI2SK |
|----|-----|--------|--------|--------|
| `ALBUM#{albumId}` | `SHARED#{recipient}` | `ALBUMSHARED#{recipient}` | `DATE#{epochMs}` | `SENDER#{owner}#DATE#{epochMs}` |

Attributes: `albumOwnerUsername`, `caption` (optional, ≤300), `sharedAt`

GSI1 gives the "albums shared with me" feed; GSI2 (same `GSI1PK`, sender-prefixed sort) gives "albums this person shared with me" for a profile — the album mirror of the SharedTrack `SENDER#` sort. Shares written before GSI2SK existed are backfilled by `scripts/backfill-album-share-sender-keys.sh`. `caption` surfaces on `SharedAlbum` and the album feed entry.

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

Mirrors the track like exactly: base key lets the owner query who liked; GSI1 gives the user's liked-albums feed. `likeCount` on the album meta is maintained via `ADD` counter transactions with read-before-write + conditional-write idempotency (`AlbumLikeRepository`; the like record is written with `attribute_not_exists(PK)` / deleted with `attribute_exists(PK)` via `TryExecuteTransactWriteAsync`, so a concurrent double like/unlike moves the counter once). Deleted with the album.

---

## Access Patterns

### Album APIs

#### `POST /albums` — CreateAlbumLambda
Request body: `{name, description?, imageKey?, trackIds?}` (≤50 tracks)
1. Own-tracks-only: `BatchGet(PK=USER#{requestor}, SK=TRACK#{id})` for every id — any miss → 400
2. Optional `imageKey` → ImageService: process staged image to `albums/{id}/cover_400x400.jpg` (public bucket) + dominant color — before any write, so a bad image 400s cleanly
3. **BatchWrite** memberships first, claim a [slug](README.md#readable-urls-slugs) from the name, then meta (`SaveAsync`, carrying `slug`) — album only becomes visible once fully written → 201

#### `GET /albums` — GetAlbumsLambda
1. `Query(GSI3, GSI3PK=ALBUMS#{requestor}, GSI3SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → own albums newest-first, paginated

#### `GET /albums/{albumId}` — GetAlbumLambda
1. `Query(GSI1, GSI1PK=ALBUM#{id}, GSI1SK=INFO)` → meta or 404
2. Access: owner, or `GetItem(PK=ALBUM#{id}, SK=SHARED#{requestor})` — no per-track checks needed (all tracks are the owner's; access derives from the album share). Sets `likedByMe`; share/like counts owner-only.
3. In parallel: like status (`GetItem(PK=ALBUM#{id}, SK=LIKE#{requestor})`), the owner's profile (`GetItem(PK=USER#{owner}, SK=PROFILE)` → `album.owner` UserSummary for the header), and `Query(GSI1, GSI1PK=ALBUM#{id}, begins_with ORDER#, ascending, Limit=10, cursor)` + `TrackBatchLookup` join → meta + paginated tracks

#### `GET /albums/{albumId}/recipients` — GetAlbumRecipientsLambda
Owner-only (404 otherwise). `Query(PK=ALBUM#{id}, begins_with SHARED#)` → BatchGet recipient profiles → `{items:[{user, sharedAt}]}` newest-first. Unpaginated — there's no total recipient cap, so this would want a cursor if audiences grow (see the fan-out ceiling in [README.md](README.md#fan-out-writes-albumsharerepository--albumtracklistrepository-via-albumrecords)).

#### `PUT /albums/{albumId}` — UpdateAlbumLambda / `DELETE /albums/{albumId}` — DeleteAlbumLambda
Owner-only (404 otherwise). Update: optional `imageKey` cover processing / `clearedImage` removal, then UpdateExpression on name/description/image (+ an explicit `slug`: its guarded slug-record put in the same transaction, 400 if taken; renaming never changes it).
Delete order (revoke-first): album likes → cover image (public bucket, if set) → grants (`PK=TRACK#{tid}, SK=SHARED#{recipient}#ALBUM#{id}` for every track × recipient) → AlbumShare records (and their feed items) → memberships → [share links](links.md) → [slug](README.md#readable-urls-slugs) records → meta. All via **BatchWrite**.

#### `PUT /albums/{albumId}/tracks` — SetAlbumTracksLambda
Declarative save from the edit-tracks screen: `{trackIds: [...]}` (≤50, all owner's own tracks, empty list clears the album) **becomes** the tracklist in that order — the album's only track-editing endpoint. Last-write-wins on concurrent edits.
1. Owner check → 404; validation: ids lowercased + deduped, cap, own-tracks-only (`GetOwnedTrackIdsAsync` miss → 400)
2. Diff against current memberships: revoke grants for dropped tracks first, then write grants for new tracks (every track × existing recipient)
3. **BatchWrite** memberships: delete dropped + put the full ordered list with fresh ranks 10/20/30… (kept members re-ranked only — `addedAt`/denormalized duration preserved); `trackCount`/`totalDurationSeconds` counters adjusted by the diff

#### `POST /albums/{albumId}/share` — ShareAlbumLambda
Request body: `{add: [users], remove: [users], caption?}` — owner-only; caption sanitised/validated (`ValidateShare`, ≤300); recipients validated via `GetValidatedRecipientsAsync` (strips self/unknown/dupes + enforces each recipient's `incomingShares` setting); ≤50 people in `add` and ≤50 in `remove` per request, no total cap. The Lambda passes the **full** validated add list (no pre-dedup); `ShareAlbumAsync` classifies each against existing shares (upsert — see below).
1. Removes: delete grants (every track × removed user) first, then AlbumShare records (and their feed items)
2. Adds (upsert — every recipient in `add` is written): **new** recipient → write grants (every track × user) + AlbumShare record + feed item + `ALBUM_SHARED` activity; **existing** recipient → overwrite the AlbumShare record with the request's caption + fresh `sharedAt` (resurfaces the feed & shared-list) + new activity, grants untouched. No same-caption short-circuit; re-sharing without a caption overwrites the stored caption to null. A user in both `add` and `remove` → remove wins
3. `shareCount` adjusted by **new recipients** minus **removals that hit an existing share** (reshares don't count; removing a non-recipient is a no-op)

#### `DELETE /albums/shared/{albumId}` — RemoveSharedAlbumLambda
Recipient-side "remove from my library" — the mirror of a single-recipient unshare, callable by anyone (drops the caller's own access; no owner check). `RemoveAlbumFromLibraryAsync`:
1. `GetItem(PK=ALBUM#{id}, SK=SHARED#{requestor})` → **idempotency guard**: no-op 200 if absent
2. Delete the caller's grants (every track × requestor) first, then **one transaction**: the AlbumShare record (guarded `attribute_exists(PK)`) + its feed item (`FEED#{requestor}` / `ALBUM#{id}`) + step 3's counter — a concurrent double-remove cancels the loser, so it decrements once. Only `…#ALBUM#{albumId}` keys are touched, so any direct `SHARED#{requestor}` track shares survive — a track shared both directly and via this album stays accessible directly
3. Decrement the owner's `shareCount` by 1, in that same transaction (kept equal to the live AlbumShare record count, so the re-share upsert stays consistent). The `ALBUM_SHARED` activity item ages out via TTL, same as owner-side unshare.

### Album Like APIs

#### `POST /albums/{albumId}/like` — LikeAlbumLambda
`{newValue}`; liking gated on owner-or-recipient (`IsAlbumSharedWithUserAsync`), unliking always allowed. Idempotent like/unlike with `ADD likeCount :±1` (read-before-write fast path + existence-guarded like record).

#### `GET /albums/{albumId}/likes` — GetAlbumLikesLambda (owner-only)
`Query(PK=ALBUM#{id}, begins_with LIKE#, cursor)` → BatchGet liker profiles → `PaginatedResult<AlbumLiker>`.

#### `GET /albums/liked` — GetLikedAlbumsLambda
`Query(GSI1, GSI1PK=ALBUMLIKES#{requestor}, begins_with DATE#, cursor)` → BatchGet album metas + owners → in the handler, drop albums the caller no longer has (not theirs and no `GetItem(ALBUM#{id}, SHARED#{requestor})`; the like itself is kept, so a re-share brings it back — same rule as liked tracks) → `PaginatedResult<AlbumSummary>` (likedByMe=true; summaries carry no like/share counts; a page can be short, the cursor still continues).

#### `GET /albums/shared` — GetAlbumsSharedWithMeLambda
1. `Query(GSI1, GSI1PK=ALBUMSHARED#{requestor}, begins_with DATE#, Limit=10, cursor)` → AlbumShare records
2. Parallel BatchGet album metas (via `albumOwnerUsername`) + owner profiles → `PaginatedResult<SharedAlbum>` (share/like counts nulled for the recipient viewer)

#### `GET /users/{username}/albums/shared?limit=&cursor=` — GetAlbumsSharedFromUserLambda
1. `Query(GSI2, GSI1PK=ALBUMSHARED#{requestor}, begins_with SENDER#{username}#, Limit, ScanIndexForward=false, cursor)` → that sender's AlbumShare records to the caller, newest first
2. Same hydration as `GET /albums/shared` → `PaginatedResult<SharedAlbum>` (a profile's "Albums shared with you")
