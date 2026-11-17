# Users & Follows

Part of the [data model](README.md). Covers user profiles, the follow graph, and the private home-visit marker.

## Item Types & Key Schema

### User Profile

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `USER#{username}` | `PROFILE` | `EMAIL#{email}` | `PROFILE` | `USERS` | `USERNAME#{lowercased username}` |

GSI3 is the username search index: every profile shares the `USERS` partition so `begins_with` on the lowercased username gives case-insensitive prefix search (key format owned by `UserRepository.SearchIndexPk`/`SearchIndexSk`).

Attributes: `username`, `displayName`, `firstName`, `lastName`, `country`, `city`, `bio`, `imageUrl`, `imageBgColor`, `followingCount`, `followerCount`, `incomingShares` (`EVERYONE` — default, may be absent — | `FOLLOWING` | `NONE`), `lastSeenAt` / `activitySeenAt` (private new-since-last-visit and unread-activity markers), `createdAt`

`lastSeenAt`/`activitySeenAt` are stored on the profile item but are transient on the `User` DTO (never mapped there), so they never serialize on the many embedded User objects (feed senders, activity actors, followers, likers). `GetUserLambda` loads them via a dedicated projection only for the owner's own profile.

### Follow Relationship

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `FOLLOW#{usernameBeingFollowed}` | `USER#{followerUsername}` | `FOLLOWING#{followerUsername}` | `DATE#{epochMs}#TARGET#{usernameBeingFollowed}` | `FOLLOWERS#{usernameBeingFollowed}` | `DATE#{epochMs}#USER#{followerUsername}` |

Attributes: `createdAt` (= `epochMs`)

The base-table SK is deterministic — one row per (target × follower) — so follow/unfollow are keyed `GetItem`s and a double-follow is cancelled by an `attribute_not_exists` guard instead of writing a duplicate row. Date order lives in the indexes: GSI1 lists a user's followings newest-first, GSI3 their followers newest-first.

> Key format changed 2026-10-16 (SK used to be `USER#{follower}#{epochMs}`, no GSI3 keys). Rows in the old format aren't found by the new reads — dev follow rows were wiped rather than migrated.

### Hidden Suggestion

| PK | SK |
|----|-----|
| `USER#{username}` | `HIDE_SUGGESTION#{hiddenUsername}` |

Attributes: `hiddenAt`, `expiresAt` (table TTL, 180 days). A person the user dismissed from People you may know; read with `begins_with HIDE_SUGGESTION#` on each suggestions request.

### Slug

| PK | SK |
|----|----|
| `USER#{owner}` | `SLUG#{TRACK\|ALBUM\|PLAYLIST}#{slug}` |

Attributes: `targetId`, `createdAt`. One per readable URL an item has ever had — the item's current one is its meta `slug`; the rest redirect. Shares the owner partition with the profile and the owner's track/album/playlist metas, which are always queried by `begins_with` on their own SK prefix, so slug records never appear in them. Rules in [README.md](README.md#readable-urls-slugs).

---

## Access Patterns

### Cognito Triggers (no HTTP route)

#### PostConfirmationLambda — Create user on signup
- **Trigger:** Cognito `PostConfirmation_ConfirmSignUp`
- **TransactWrite** (2 parts, atomic):
  - User profile: `PK=USER#{username}`, `SK=PROFILE`, `GSI1PK=EMAIL#{email}`, `GSI1SK=PROFILE`
  - Likes playlist meta: `PK=USER#{username}`, `SK=PLAYLIST#likes`, `type=LIKES`, `name="Likes"`
- `username` is saved **lowercased** whatever casing was typed (every key uses it)
- Default values: `displayName=username`, `bio="Hey! I'm using MeloMelo!"`, counts=0, `incomingShares=EVERYONE`
- Also writes the GSI3 search keys (`GSI3PK=USERS`, `GSI3SK=USERNAME#{lowercased username}`)

#### CheckEmailExistenceLambda — Validate email uniqueness on pre-signup
- **Trigger:** Cognito `PreSignUp`
- **No DynamoDB access** — validates via Cognito `ListUsers` API with email filter
- Also validates username format via regex: `^[a-zA-Z0-9._]{2,30}$` (any casing — PostConfirmation saves it lowercased)

### User APIs

#### `POST /profile/update` — UpdateUserProfileLambda
1. If `imageKey` provided: must be staged under the caller's prefix (`{username}/…`, else 400); fetch image from S3 Dropbox bucket, resize to 400x400, upload to Public bucket as `users/{username}/profile_400x400.jpg`, extract dominant color
2. `TransactWrite` with `UpdateExpression` on `PK=USER#{username}, SK=PROFILE`
   - Uses `SET` for provided fields, `REMOVE` for cleared fields (`UpdateExpressionBuilder` generates the expression dynamically)
   - `incomingShares` is only written when present in the request (omitted/null leaves it unchanged, unlike the other fields)
3. `GetItem(PK=USER#{username}, SK=PROFILE)` → returns updated User

#### `GET /users/{username}` — GetUserLambda (profile + shared-with-you count)
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → profile or 404
2. Own profile: surface the private `lastSeenAt`/`activitySeenAt` (via a dedicated `SeenMarkersDataModel` projection). Viewing someone else: leave those null and `CountAsync(GSI2, SHARED#{requestor}, begins_with SENDER#{username}#)` → `sharedWithYouCount`

#### `GET /users/suggestions` — GetSuggestedUsersLambda
People you may know, worked out on each request (no precomputed rows; ~35 small reads). In parallel:
1. `Query(GSI1, GSI1PK=FOLLOWING#{requestor}, Limit=200)` → who they follow (excluded)
2. `Query(GSI3, GSI3PK=FOLLOWERS#{requestor}, Limit=200)` → who follows them ("Follows you")
3. `Query(GSI1, GSI1PK=SHARED#{requestor}, Limit=100)` + `Query(GSI1, GSI1PK=ALBUMSHARED#{requestor}, Limit=100)` → owners of what was shared with them ("Shared music with you")
4. `Query(GSI3, GSI3PK=USER#{requestor}, Limit=20)` → their 20 newest tracks → `Query(PK=TRACK#{t}, begins_with SHARED#)` each, grants (`SHARED#{u}#ALBUM#…`) skipped → who they shared with ("You shared with them"; there's no index by sender)
5. `Query(PK=USER#{requestor}, begins_with HIDE_SUGGESTION#)` → dismissed (excluded)

Then `Query(GSI1, GSI1PK=FOLLOWING#{f}, Limit=100)` for up to 30 of their most recent followings → friends of friends (each person they follow who follows a candidate is a mutual). Scored by `SuggestionScoring` (10 / 10 / 6, +2 per mutual), top 40 → `BatchGet FOLLOW#{candidate}/USER#{requestor}` drops anyone they already follow past the 200 cap → top 20 → one deduped profile BatchGet for the candidates and their first two mutuals → `{items: [{user, reason, mutuals, mutualCount}]}`. Mutuals are named (follow lists are public); co-recipients of a share are never used to explain a suggestion.

#### `POST /users/suggestions/{username}/hide` — HideSuggestionLambda
Put `USER#{requestor}` / `HIDE_SUGGESTION#{username}` (180-day TTL). 400 for yourself. `suggestions` is a reserved username, since this static path outranks `/users/{username}`.

#### `GET /users/search?q=&limit=&cursor=` — SearchUsersLambda
1. Validate `q`: trim + lowercase, 400 if empty or outside the username charset (`[a-zA-Z0-9._]`)
2. `Query(GSI3, GSI3PK=USERS, GSI3SK begins_with USERNAME#{q}, Limit, ScanIndexForward=true, cursor)` → `PaginatedResult<UserSummary>` alphabetically (GSI3 projects ALL, so no hydration step)

#### `GET /users/{username}/slugs/{kind}/{slug}` — ResolveSlugLambda
`kind` = `tracks` | `albums` | `playlists` (anything else 404). Under `/slugs/` so a slug can't collide with `/users/{u}/albums/shared` and friends.
1. Playlists: caller ≠ owner → 404 before any read (private)
2. `GetItem(PK=USER#{owner}, SK=SLUG#{KIND}#{slug})` → `targetId` (404 if absent)
3. Access, same as the item's detail GET: track → `GetTrackAsync` + owner match + `IsTrackAccessibleToUser`; album → `GetAlbumByIdAsync` + owner match + owner or `IsAlbumSharedWithUserAsync`; playlist → `GetItem(USER#{owner}, PLAYLIST#{id})`
4. → `{id, slug: meta.slug}` (the canonical slug; differs from the requested one after a URL change). Every miss — no slug, no access, someone else's playlist, an old slug of an item you can't see — is the identical 404 `"This isn't available"`, so a guessed URL reveals nothing.

#### `POST /me/seen` — MarkSeenLambda
`UpdateItem SET lastSeenAt = now` on the profile (the new-since-last-visit marker; the client renders the divider itself).

### Follow APIs

#### `GET /users/{username}/follow-status` — IsFollowingUserLambda
1. `GetItem(PK=FOLLOW#{username}, SK=USER#{requestor})` → `{followStatus: bool, createdAt}`

#### `POST /users/{username}/follow-user` — FollowUserLambda
Request body: `{newValue: true|false}`. Following (or unfollowing) yourself, in any casing → **400** "You can't follow yourself." — rejected in the Lambda, and `FollowUser` throws on it too: both counters live on the one profile item and a transaction can't touch an item twice.

**Follow** (`newValue: true`):
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → verify target user exists
2. **TransactWrite** (3 parts, atomic):
   - `Save` follow record, guarded `attribute_not_exists(PK)` via `AddConditionalSave` (a concurrent double-follow cancels the whole transaction, so the record — and the activity derived from it — is written once): `PK=FOLLOW#{username}, SK=USER#{requestor}, GSI1PK=FOLLOWING#{requestor}, GSI1SK=DATE#{epochMs}#TARGET#{username}, GSI3PK=FOLLOWERS#{username}, GSI3SK=DATE#{epochMs}#USER#{requestor}`
   - `Update` target user: `ADD followerCount :1` on `PK=USER#{username}, SK=PROFILE`
   - `Update` requestor: `ADD followingCount :1` on `PK=USER#{requestor}, SK=PROFILE`
   - The followed user's `USER_FOLLOWED` activity (`SK=DATE#{createdAt}#FOLLOW#{requestor}`) follows from the follow record via the stream — see [activity.md](activity.md).

**Unfollow** (`newValue: false`):
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → verify target user exists
2. `GetItem(PK=FOLLOW#{username}, SK=USER#{requestor})` → follow record; no-op if absent
3. **TransactWrite** (3 parts, atomic):
   - `Delete` follow record, guarded `attribute_exists(PK)` (all parts run via `TryExecuteTransactWriteAsync`, so a concurrent double-unfollow decrements once)
   - `Update` target user: `ADD followerCount :-1` on `PK=USER#{username}, SK=PROFILE`
   - `Update` requestor: `ADD followingCount :-1` on `PK=USER#{requestor}, SK=PROFILE`
   - Deleting the follow record deletes its `USER_FOLLOWED` activity row (stream consumer)

#### `GET /users/{username}/followers` — GetUserFollowersLambda
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → check user exists (follow lists are visible to anyone signed in)
2. `Query(GSI3, GSI3PK=FOLLOWERS#{username}, GSI3SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated follow records newest-first
3. Extract follower username from SK: `USER#{followerUsername}`
4. `BatchGet` the (deduped) follower profiles, re-ordered to match the page → returns `PaginatedResult<UserSummary>`

#### `GET /users/{username}/followings` — GetUserFollowingLambda
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → check user exists (follow lists are visible to anyone signed in)
2. `Query(GSI1, GSI1PK=FOLLOWING#{username}, GSI1SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated following records newest-first
3. Extract followed username from GSI1SK: `DATE#{epochMs}#TARGET#{targetUsername}` → `split("#TARGET#")[1]`
4. `BatchGet` the (deduped) followed users' profiles, re-ordered to match the page → returns `PaginatedResult<UserSummary>`

> The `incomingShares` setting is enforced when validating share recipients — see [tracks.md](tracks.md) and [albums.md](albums.md).
