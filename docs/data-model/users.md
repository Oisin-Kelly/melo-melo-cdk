# Users & Follows

Part of the [data model](README.md). Covers user profiles, the follow graph, and the private home-visit marker.

## Item Types & Key Schema

### User Profile

| PK | SK | GSI1PK | GSI1SK | GSI3PK | GSI3SK |
|----|-----|--------|--------|--------|--------|
| `USER#{username}` | `PROFILE` | `EMAIL#{email}` | `PROFILE` | `USERS` | `USERNAME#{lowercased username}` |

GSI3 is the username search index: every profile shares the `USERS` partition so `begins_with` on the lowercased username gives case-insensitive prefix search (key format owned by `UserRepository.SearchIndexPk`/`SearchIndexSk`). Profiles created before this index existed are backfilled by `scripts/backfill-user-search-keys.sh`.

Attributes: `username`, `displayName`, `firstName`, `lastName`, `country`, `city`, `bio`, `imageUrl`, `imageBgColor`, `followingCount`, `followerCount`, `followingsPrivate`, `followersPrivate`, `incomingShares` (`EVERYONE` — default, may be absent — | `FOLLOWING` | `NONE`), `lastSeenAt` / `activitySeenAt` (private new-since-last-visit and unread-activity markers), `createdAt`

`lastSeenAt`/`activitySeenAt` are stored on the profile item but are transient on the `User` DTO (never mapped there), so they never serialize on the many embedded User objects (feed senders, activity actors, followers, likers). `GetUserLambda` loads them via a dedicated projection only for the owner's own profile.

### Follow Relationship

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `FOLLOW#{usernameBeingFollowed}` | `USER#{followerUsername}#{epochMs}` | `FOLLOWING#{followerUsername}` | `DATE#{epochMs}#TARGET#{usernameBeingFollowed}` |

Attributes: `createdAt`

SK includes epoch timestamp for chronological sorting on base table (newest followers first).
GSI1SK includes epoch timestamp for chronological sorting in GSI1 (newest followings first).

---

## Access Patterns

### Cognito Triggers (no HTTP route)

#### PostConfirmationLambda — Create user on signup
- **Trigger:** Cognito `PostConfirmation_ConfirmSignUp`
- **TransactWrite** (2 parts, atomic):
  - User profile: `PK=USER#{username}`, `SK=PROFILE`, `GSI1PK=EMAIL#{email}`, `GSI1SK=PROFILE`
  - Likes playlist meta: `PK=USER#{username}`, `SK=PLAYLIST#likes`, `type=LIKES`, `name="Likes"`
- Default values: `displayName=username`, `bio="Hey! I'm using MeloMelo!"`, counts=0, privacy=false, `incomingShares=EVERYONE`
- Also writes the GSI3 search keys (`GSI3PK=USERS`, `GSI3SK=USERNAME#{lowercased username}`)

#### CheckEmailExistenceLambda — Validate email uniqueness on pre-signup
- **Trigger:** Cognito `PreSignUp`
- **No DynamoDB access** — validates via Cognito `ListUsers` API with email filter
- Also validates username format via regex: `^[a-zA-Z0-9._]{2,30}$`

### User APIs

#### `POST /profile/update` — UpdateUserProfileLambda
1. If `imageKey` provided: fetch image from S3 Dropbox bucket, resize to 400x400, upload to Public bucket as `users/{username}/profile_400x400.jpg`, extract dominant color
2. `TransactWrite` with `UpdateExpression` on `PK=USER#{username}, SK=PROFILE`
   - Uses `SET` for provided fields, `REMOVE` for cleared fields (`UpdateExpressionBuilder` generates the expression dynamically)
   - `incomingShares` is only written when present in the request (omitted/null leaves it unchanged, unlike the other fields)
3. `GetItem(PK=USER#{username}, SK=PROFILE)` → returns updated User

#### `GET /users/{username}` — GetUserLambda (profile + shared-with-you count)
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → profile or 404
2. Own profile: surface the private `lastSeenAt`/`activitySeenAt` (via a dedicated `SeenMarkersDataModel` projection). Viewing someone else: leave those null and `CountAsync(GSI2, SHARED#{requestor}, begins_with SENDER#{username}#)` → `sharedWithYouCount`

#### `GET /users/search?q=&limit=&cursor=` — SearchUsersLambda
1. Validate `q`: trim + lowercase, 400 if empty or outside the username charset (`[a-zA-Z0-9._]`)
2. `Query(GSI3, GSI3PK=USERS, GSI3SK begins_with USERNAME#{q}, Limit, ScanIndexForward=true, cursor)` → `PaginatedResult<UserSummary>` alphabetically (GSI3 projects ALL, so no hydration step)

#### `POST /me/seen` — MarkSeenLambda
`UpdateItem SET lastSeenAt = now` on the profile (the new-since-last-visit marker; the client renders the divider itself).

### Follow APIs

#### `GET /users/{username}/follow-status` — IsFollowingUserLambda
1. `Query(PK=FOLLOW#{username}, SK begins_with USER#{requestor}#)` → `{followStatus: bool, createdAt}` (1 item max)

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
4. `BatchGet` each follower's profile → returns `PaginatedResult<UserSummary>`

#### `GET /users/{username}/followings` — GetUserFollowingLambda
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → check user exists + `followingsPrivate` flag
2. `Query(GSI1, GSI1PK=FOLLOWING#{username}, GSI1SK begins_with DATE#, Limit=10, ScanIndexForward=false, cursor)` → paginated following records newest-first
3. Extract followed username from GSI1SK: `DATE#{epochMs}#TARGET#{targetUsername}` → `split("#TARGET#")[1]`
4. `BatchGet` each followed user's profile → returns `PaginatedResult<UserSummary>`

> The `incomingShares` setting is enforced when validating share recipients — see [tracks.md](tracks.md) and [albums.md](albums.md).
