# Activity & Resume Progress

Part of the [data model](README.md). The per-recipient activity log and the resume/continue-listening position. Both self-expire via a table TTL.

## Item Types & Key Schema

### Activity Item (per-recipient activity feed)

| PK | SK |
|----|-----|
| `ACTIVITY#{recipient}` | `DATE#{epochMs}#{shortId}` (likes/shares) or `DATE#{followTs}#FOLLOW#{follower}` (follows) |

Attributes: `type` (`TRACK_LIKED` \| `ALBUM_LIKED` \| `TRACK_SHARED` \| `ALBUM_SHARED` \| `USER_FOLLOWED`), `actorUsername`, `targetType` (`TRACK`\|`ALBUM`\|`USER`), `targetId`, `createdAt`, `expiresAt` (90-day TTL). No GSI — queried newest-first by the descending `DATE#` sort key; the random `shortId` disambiguates same-ms like/share events, while **follow** items instead use a deterministic `FOLLOW#{follower}` suffix (built by `ActivityItems.BuildFollow`) so unfollow can reconstruct and delete the exact key.

Recipient-perspective, written in the triggering operation's batch/transaction (`ActivityItems`): `TRACK_LIKED`/`ALBUM_LIKED` → the track/album owner (never a self-like); `TRACK_SHARED`/`ALBUM_SHARED` → every recipient in the share's `add` (a re-share to an existing recipient writes a fresh row; liveness shows only the newest, see below); `USER_FOLLOWED` → the followed user (never a self-follow), written as a 4th part of the follow transaction (its `USER` target is the follower, which the actor profile already carries, so there is no separate name to hydrate). Adding tracks to a shared album grants access but deliberately writes no activity. Read hydration resolves the actor profile and, for track/album targets, the target name (target owner = the actor except for the like types, where the viewer owns their liked track/album). Listen-analytics events could slot into this entity later.

### User Progress (resume / continue-listening)

| PK | SK |
|----|-----|
| `USER#{username}` | `PROGRESS#LATEST` |

Attributes: `contextType` (`TRACK`/`ALBUM`/`PLAYLIST`, or `LIST` — a list the web app rebuilds itself, such as Home or a profile's tracks, whose `contextId` is the app's own list id), `contextId`, `trackId`, `positionSeconds`, `updatedAt`, `expiresAt` (table TTL — 30-day self-expiry, shares the attribute with upload status). No GSI — a single resume slot per user, overwritten by every heartbeat regardless of context and deleted on `completed`, so both reads and writes are keyed point operations.

---

## Access Patterns

### Activity API

#### `GET /activity` — GetActivityLambda — a **live snapshot**, not an event log
`Query(PK=ACTIVITY#{requestor}, begins_with DATE#, ScanIndexForward=false, Limit=20, cursor)` → BatchGet actor profiles + target metas (per-type owner; keys **de-duplicated** — a user can have multiple activities about the same target, and `BatchGetItem` rejects duplicate keys) → `PaginatedResult<ActivityEntry>`. The read materialises current state: a row is kept only if **all** of

1. the **actor** resolves,
2. for like/share rows, the **target** still resolves (deleted track/album ⇒ dropped), **and**
3. for like/share rows, the **exact relationship record that produced the row still exists** — a liveness probe (`KeyProbeDataModel` BatchGet) of `TRACK#{t}/SHARED#{viewer}`, `ALBUM#{a}/SHARED#{viewer}`, `TRACK#{t}/LIKE#{actor}`, or `ALBUM#{a}/LIKE#{actor}`. The probe also reads the record's `likedAt`/`sharedAt`, which must equal the row's `createdAt` (all writers use one `now` for both) — so after unlike→re-like or a re-share, only the newest row shows and older rows don't revive against the recreated key. This is what makes unshare / unlike / remove-from-library drop the row. Deliberately the *direct* record, not general access (an album grant must not keep a `TRACK_SHARED` row alive).

Follow rows skip (2) and (3): their `USER` target has no name and they're **eager-deleted on unfollow** (deterministic SK, keyed-delete in the same transaction that removes the follow record). Rows are never *physically* deleted on unshare/unlike (they age out via the 90-day TTL) — the read does the hiding, so heavy filtering can yield a short page while `NextCursor` is non-null (return-short; the client keeps paging).

#### `POST /me/activity-seen` — MarkActivitySeenLambda
`UpdateItem SET activitySeenAt = now` on the profile (unread-activity marker). The client badges activity newer than this — and must compute the badge from the **filtered `GET /activity` feed**, never a raw item count, or it would count hidden/stale rows the list doesn't show.

### Progress API

#### `PUT /me/progress` — UpdateProgressLambda
Body `{contextType, contextId, trackId, positionSeconds}` → keyed upsert of the resume slot, 30-day TTL. `{completed: true}` instead deletes the slot (playback finished naturally — otherwise the card would offer to "resume" from seconds before the end); the other fields are ignored on a completed request.

#### `GET /me/progress` — GetProgressLambda
`GetItem(PK=USER#{requestor}, SK=PROGRESS#LATEST)`; returned only if its `trackId` still resolves and is accessible (track hydrated), else `204`. A deleted/revoked track is skipped, not surfaced as dead resume state.
