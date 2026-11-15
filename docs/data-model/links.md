# Share Links

Part of the [data model](README.md). A share link invites whoever holds it to add one track or album to their library. **Accepting runs the ordinary share upsert** (`ShareTrackAsync` / `ShareAlbumAsync` with `add: [caller]`), so the accepter becomes a normal recipient — the access rule, Home feed, Shared with, Manage access, Remove from my library and `shareCount` all work unchanged. The link record itself only decides who may claim it and until when.

## Item Types & Key Schema

### Share Link

| PK | SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|
| `LINK#{token}` | `META` | `LINKS#{TRACK\|ALBUM}#{targetId}` | `DATE#{createdAt}` |

Attributes: `token`, `owner`, `kind` (`TRACK`\|`ALBUM`), `targetId`, `createdAt`, `linkExpiresAt` (epoch ms — when it stops working; 24h / 7d / 30d from creation), `expiresAt` (epoch s — the table's TTL attribute, `linkExpiresAt` + 30 days, so an expired link can still say "expired" for a month rather than "isn't available"), `allowPreview` (default true), `caption?` (≤300, sanitised like a share caption — shown on the invite screen and passed as the share's caption on accept), `acceptedCount`, `revokedAt?` (epoch ms; removed again by restore).

- **Token**: 16 random bytes (`RandomNumberGenerator`), base64url, 22 characters — unguessable. Anything not shaped like one is unavailable without a lookup (`ShareLinks.IsWellFormed`).
- **State** (`ShareLinks.StateOf`): `REVOKED` if `revokedAt` is set (wins over expiry), else `EXPIRED` once `now ≥ linkExpiresAt`, else `ACTIVE`. Every read checks it itself — TTL deletion runs late.
- **GSI3** lists an item's links for its owner (the Share dialog); GSI3's keys are independent, so this needs no index change.
- **Revoking** stops new people joining; people who already accepted keep their (ordinary) share, and the owner removes them from the people list as usual. A person the owner removed can rejoin with a link they still have.
- **Deletion**: `DeleteTrackAsync` / `DeleteAlbumAsync` delete every link to the item (`IShareLinkRepository.DeleteLinksForTargetAsync`, GSI3 query → batch delete).

### Preview clip (S3, not DynamoDB)

`processed/{trackId}/preview.m4a` in the private bucket: 30s, 128k AAC, 1s fades, starting 30s in (or a quarter of the way through when that's earlier, and never so late that 30s doesn't fit). Cut by `ProcessTrackLambda` (`AudioService.CutPreviewAsync`, right after the main encode) for every track **over 30s** — a failed cut fails the upload like any other ffmpeg error. Shorter tracks play in full (their `audio.m4a`). Tracks processed before clips existed have none (dev: re-upload them). `DeleteAudioAsync` deletes it with the audio and original.

---

## Access Patterns

#### `POST /links` — CreateLinkLambda
Body `{kind, targetId, expiresIn?: '24h'|'7d'|'30d' (default 7d), allowPreview?: bool (default true), caption?}` (caption sanitised with `InputSanitiser.MultiLine`, >300 → 400). Bad kind/target/expiry → 400. Item lookup (`ILinkTargetService.GetAsync` — track by id, or album meta + tracklist) → owner check (404 otherwise) → guarded put (`attribute_not_exists(PK)`) → 201 `ShareLink`.

#### `GET /links?kind=&targetId=` — GetLinksLambda
Owner check as above → `Query(GSI3, GSI3PK=LINKS#{kind}#{id}, begins_with DATE#)` → newest first, each with its `state`. Not paginated (a handful per item).

#### `DELETE /links/{token}` — RevokeLinkLambda / `POST /links/{token}/restore` — RestoreLinkLambda
`GetItem(LINK#{token}, META)` → link-owner check (404 otherwise) → guarded update (`attribute_exists(PK)`, so an unknown token never creates an item): `SET revokedAt = if_not_exists(revokedAt, :now)` / `REMOVE revokedAt` → 200 `ShareLink`.

#### `GET /links/{token}` — GetLinkPreviewLambda — **public** (no authorizer)
The API's only unauthenticated route; throttled on its own (route settings: 20 rps, burst 40, across all callers). Always 200 with a `state`:
- `UNAVAILABLE` — unknown, malformed, revoked, item deleted, or sender gone: `{state}` only, identical for all, so a dead link reveals nothing.
- `EXPIRED` — `{state, kind, sender, expiresAt}`: who sent it, nothing about what.
- `VALID` — sender `UserSummary`, the item's name/cover/`imageBgColor`/genre/duration, `expiresAt`, `allowPreview`, `caption`, and `tracks` (the track, or the album's tracklist in order) each with `preview: {url, isFullTrack} | null` when `allowPreview`: a 10-minute presigned GET of `preview.m4a`, or of `audio.m4a` for a track of 30s or less.

#### `GET /links/{token}/viewer` — GetLinkViewerLambda
Signed in. Revoked/unknown/deleted → 404. `relation`: `OWN` (with the link's stats), `ALREADY_HAVE` (the item's usual access rule — owner, direct share or album grant / album share), or `NONE`; plus `target {kind, id, owner, slug}`. A separate route because an HTTP API route is either authorized or not.

#### `POST /links/{token}/accept` — AcceptLinkLambda
Signed in. Revoked/unknown/deleted → 404; own link → 400; expired → 410; already has access → 200, nothing written. Otherwise:
1. **Claim**: `UpdateItem(LINK#{token}) ADD acceptedCount 1` guarded `attribute_exists(PK) AND attribute_not_exists(revokedAt) AND linkExpiresAt > :now` — run **before** the share, so a revoke or expiry racing the accept wins (failed claim → 404/410, nothing shared). The counter is display-only; drift if the share then fails is tolerated.
2. **Share**: the ordinary upsert with `add: [caller]`, the link's `caption` as the share caption, `notifyRecipients: false` — the feed item is written, the share record carries `via: LINK`, so the stream consumer writes no "shared with you" activity (they added it themselves). `GetValidatedRecipientsAsync` is skipped on purpose: the recipient's `incomingShares` setting doesn't apply to something they chose to add. Album grants fan out as for any new album recipient.

Returns `{kind, id, owner, slug}`.
