# Activity & Resume Progress

Part of the [data model](README.md). The per-recipient activity log and the resume/continue-listening position. Both self-expire via a table TTL.

## Item Types & Key Schema

### Activity Item (per-recipient activity feed)

| PK | SK |
|----|-----|
| `ACTIVITY#{recipient}` | `DATE#{epochMs}#{shortId}` |

Attributes: `type` (`TRACK_LIKED` \| `ALBUM_LIKED` \| `TRACK_SHARED` \| `ALBUM_SHARED`), `actorUsername`, `targetType` (`TRACK`\|`ALBUM`), `targetId`, `createdAt`, `expiresAt` (90-day TTL). No GSI — queried newest-first by the descending `DATE#` sort key; `shortId` disambiguates same-ms events.

Recipient-perspective, written in the triggering operation's batch/transaction (`ActivityItems`): `TRACK_LIKED`/`ALBUM_LIKED` → the track/album owner (never a self-like); `TRACK_SHARED`/`ALBUM_SHARED` → each new recipient. Adding tracks to a shared album grants access but deliberately writes no activity. Read hydration resolves the actor profile and the target name, with the target owner being the actor except for the like types (the viewer owns their liked track/album). Listen-analytics events could slot into this entity later.

### User Progress (resume / continue-listening)

| PK | SK |
|----|-----|
| `USER#{username}` | `PROGRESS#LATEST` |

Attributes: `contextType`, `contextId`, `trackId`, `positionSeconds`, `updatedAt`, `expiresAt` (table TTL — 30-day self-expiry, shares the attribute with upload status). No GSI — a single resume slot per user, overwritten by every heartbeat regardless of context and deleted on `completed`, so both reads and writes are keyed point operations.

---

## Access Patterns

### Activity API

#### `GET /activity` — GetActivityLambda
`Query(PK=ACTIVITY#{requestor}, begins_with DATE#, ScanIndexForward=false, Limit=20, cursor)` → BatchGet actor profiles + target metas (per-type owner; keys **de-duplicated** — a user can have multiple activities about the same target, and `BatchGetItem` rejects duplicate keys) → `PaginatedResult<ActivityEntry>`. Entries whose actor or target no longer resolves (deleted track/album) are **dropped**, not surfaced as placeholders — activity items are never deleted on unshare/revoke or target deletion (they age out via the 90-day TTL), so the read side does the hiding. A revoked-but-existing target still shows; tapping it 404s and the client should treat that as "no longer available".

#### `POST /me/activity-seen` — MarkActivitySeenLambda
`UpdateItem SET activitySeenAt = now` on the profile (unread-activity marker; the client badges activity newer than this).

### Progress API

#### `PUT /me/progress` — UpdateProgressLambda
Body `{contextType, contextId, trackId, positionSeconds}` → keyed upsert of the resume slot, 30-day TTL. `{completed: true}` instead deletes the slot (playback finished naturally — otherwise the card would offer to "resume" from seconds before the end); the other fields are ignored on a completed request.

#### `GET /me/progress` — GetProgressLambda
`GetItem(PK=USER#{requestor}, SK=PROGRESS#LATEST)`; returned only if its `trackId` still resolves and is accessible (track hydrated), else `204`. A deleted/revoked track is skipped, not surfaced as dead resume state.
