# Activity & Resume Progress

Part of the [data model](README.md). The per-recipient activity log and the resume/continue-listening position. Both self-expire via a table TTL.

## Item Types & Key Schema

### Activity Item (per-recipient activity feed)

| PK | SK |
|----|-----|
| `ACTIVITY#{recipient}` | `DATE#{likedAt}#LIKE#{liker}#{TYPE}#{id}` (likes), `DATE#{sharedAt}#SHARE#{TYPE}#{id}` (shares), `DATE#{followTs}#FOLLOW#{follower}` (follows) |

Attributes: `type` (`TRACK_LIKED` \| `ALBUM_LIKED` \| `TRACK_SHARED` \| `ALBUM_SHARED` \| `USER_FOLLOWED`), `actorUsername`, `targetType` (`TRACK`\|`ALBUM`\|`USER`), `targetId`, `createdAt` (the like's/share's/follow's own timestamp). No GSI and **no TTL** — a row lasts exactly as long as the record behind it. Queried newest-first by the descending `DATE#` sort key.

**Written by the table's stream, not the request.** The rows are derived from the records that cause them by `Adapters/Events/ActivityEvents`, run by `TableEventsLambda` off the table's DynamoDB Stream (`NEW_AND_OLD_IMAGES`; see [README.md](README.md#stream-consumers)). Like/share/follow writes keep only their counters in their transactions.

| Record (keys) | Added | Changed | Removed |
|---|---|---|---|
| `TRACK#{t}` / `LIKE#{u}` | `TRACK_LIKED` → `trackOwnerUsername` (no self-like) | — | row deleted |
| `ALBUM#{a}` / `LIKE#{u}` | `ALBUM_LIKED` → `albumOwnerUsername` (no self-like) | — | row deleted |
| `TRACK#{t}` / `SHARED#{r}` | `TRACK_SHARED` → `r` | new `sharedAt` (re-share): old row deleted, new one written (moves to the top) | row deleted |
| `ALBUM#{a}` / `SHARED#{r}` | `ALBUM_SHARED` → `r` | as above | row deleted |
| `FOLLOW#{target}` / `USER#{follower}` | `USER_FOLLOWED` → target | — | row deleted |

Album grants (`SHARED#{r}#ALBUM#{id}`) make no row (adding tracks to a shared album grants access silently). A share record with `via: "LINK"` (the recipient accepted a share link — their own doing) makes no row; an owner re-sharing it later rewrites the record without `via`, which does. TTL expiries are ignored. Every key is rebuilt from the record's own attributes, so a redelivered change rewrites the same row and a removal deletes the exact one. Read hydration resolves the actor profile and, for track/album targets, the target name (target owner = the actor except for the like types, where the viewer owns their liked track/album).

### User Progress (resume / continue-listening)

| PK | SK |
|----|-----|
| `USER#{username}` | `PROGRESS#LATEST` |

Attributes: `contextType` (`TRACK`/`ALBUM`/`PLAYLIST`, or `LIST` — a list the web app rebuilds itself, such as Home or a profile's tracks, whose `contextId` is the app's own list id), `contextId`, `trackId`, `positionSeconds`, `updatedAt`, `expiresAt` (table TTL — 30-day self-expiry, shares the attribute with upload status). No GSI — a single resume slot per user, overwritten by every heartbeat regardless of context and deleted on `completed`, so both reads and writes are keyed point operations.

---

## Access Patterns

### Activity API

#### `GET /activity` — GetActivityLambda
`Query(PK=ACTIVITY#{requestor}, begins_with DATE#, ScanIndexForward=false, Limit=20, cursor)` → BatchGet actor profiles + target metas (per-type owner; keys **de-duplicated** — `BatchGetItem` rejects duplicate keys) → `PaginatedResult<ActivityEntry>`. Rows already exist only while their like/share/follow does (the stream consumer deletes them with it), so the read just drops a row whose **actor** no longer resolves or — for like/share rows — whose **target** has been deleted. A dropped row can make a short page while `NextCursor` is non-null (return-short; the client keeps paging).

#### `POST /me/activity-seen` — MarkActivitySeenLambda
`UpdateItem SET activitySeenAt = now` on the profile (unread-activity marker). The client badges activity newer than this — and must compute the badge from the **filtered `GET /activity` feed**, never a raw item count, or it would count hidden/stale rows the list doesn't show.

### Progress API

#### `PUT /me/progress` — UpdateProgressLambda
Body `{contextType, contextId, trackId, positionSeconds}` → keyed upsert of the resume slot, 30-day TTL. `{completed: true}` instead deletes the slot (playback finished naturally — otherwise the card would offer to "resume" from seconds before the end); the other fields are ignored on a completed request.

#### `GET /me/progress` — GetProgressLambda
`GetItem(PK=USER#{requestor}, SK=PROGRESS#LATEST)`; returned only if its `trackId` still resolves and is accessible (track hydrated), else `204`. A deleted/revoked track is skipped, not surfaced as dead resume state.
