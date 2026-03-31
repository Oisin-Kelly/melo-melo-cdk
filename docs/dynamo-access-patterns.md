# DynamoDB Access Patterns

Table: `melo-melo-table-{env}` | Keys: `PK` (hash), `SK` (range)
Index: `GSI1` — `GSI1PK` (hash), `GSI1SK` (range), projection ALL

---

## Item Types & Key Schema

### User Profile

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `USER#{username}` | `PROFILE` | `EMAIL#{email}` | `PROFILE` |

Attributes: `username`, `displayName`, `firstName`, `lastName`, `country`, `city`, `bio`, `imageUrl`, `imageBgColor`, `followingCount`, `followerCount`, `followingsPrivate`, `followersPrivate`, `createdAt`

### Track

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `USER#{ownerUsername}` | `TRACK#{trackId}` | `TRACK#{trackId}` | `INFO` |

Attributes: `trackName`, `description`, `genre`, `imageUrl`, `imageBgColor`, `createdAt`, `duration`, `segments`

Derived: `OwnerUsername` from `PK.Replace("USER#", "")`, `TrackId` from `SK.Replace("TRACK#", "")`

### Follow Relationship

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `FOLLOW#{usernameBeingFollowed}` | `USER#{followerUsername}` | `FOLLOWING#{followerUsername}` | `FOLLOWING#{followerUsername}` |

Attributes: `createdAt`

### Shared Track

| PK | SK | GSI1PK | GSI1SK |
|----|-----|--------|--------|
| `TRACK#{trackId}` | `SHARED#{recipientUserId}` | `SHARED#{recipientUserId}` | `USER#{senderUserId}` |

Attributes: `caption`, `sharedAt`

---

## Access Patterns by API

### Cognito Triggers (no HTTP route)

#### PostConfirmationLambda — Create user on signup
- **Trigger:** Cognito `PostConfirmation_ConfirmSignUp`
- **Write:** `SaveAsync(UserDataModel)` — creates item with `PK=USER#{username}`, `SK=PROFILE`, `GSI1PK=EMAIL#{email}`, `GSI1SK=PROFILE`
- Default values: `displayName=username`, `bio="Hey! I'm using MeloMelo!"`, counts=0, privacy=false

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
   - `Save` follow record: `PK=FOLLOW#{username}, SK=USER#{requestor}, GSI1PK=FOLLOWING#{requestor}, GSI1SK=FOLLOWING#{requestor}`
   - `Update` target user: `ADD followerCount :1` on `PK=USER#{username}, SK=PROFILE`
   - `Update` requestor: `ADD followingCount :1` on `PK=USER#{requestor}, SK=PROFILE`

**Unfollow** (`newValue: false`):
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → verify target user exists
2. **TransactWrite** (3 parts, atomic):
   - `Delete` follow record: `PK=FOLLOW#{username}, SK=USER#{requestor}`
   - `Update` target user: `ADD followerCount :-1` on `PK=USER#{username}, SK=PROFILE`
   - `Update` requestor: `ADD followingCount :-1` on `PK=USER#{requestor}, SK=PROFILE`

#### `GET /users/{username}/followers` — GetUserFollowersLambda
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → check user exists + `followersPrivate` flag
2. `Query(PK=FOLLOW#{username})` → all follow records (SK = `USER#{followerUsername}`)
3. `BatchGet` each follower's profile: `(PK=SK_from_step2, SK=PROFILE)` → returns `List<User>`

#### `GET /users/{username}/followings` — GetUserFollowingLambda
1. `GetItem(PK=USER#{username}, SK=PROFILE)` → check user exists + `followingsPrivate` flag
2. `Query(GSI1, GSI1PK=FOLLOWING#{username}, GSI1SK=FOLLOWING#{username})` → all following records
3. Extract followed usernames from `PK.Replace("FOLLOW#", "")`
4. `BatchGet` each followed user's profile: `(PK=USER#{followedUsername}, SK=PROFILE)` → returns `List<User>`

---

### Track APIs

#### `GET /tracks/{trackId}` — GetTrackLambda
1. `Query(GSI1, GSI1PK=TRACK#{trackId}, GSI1SK=INFO)` → get TrackDataModel (owner unknown at query time, need GSI)
2. `GetItem(PK=USER#{ownerUsername}, SK=PROFILE)` → get track owner's profile
3. `GetItem(PK=TRACK#{trackId}, SK=SHARED#{requestor})` → check if track is shared with requestor
4. Returns track only if requestor is owner OR track is shared with them (else 404)

#### `GET /tracks/shared` — GetTracksSharedWithUserLambda
1. `Query(GSI1, GSI1PK=SHARED#{requestor})` → all SharedTrackDataModel items for this user
2. **Parallel BatchGet** (two concurrent calls):
   - Tracks: `BatchGet(PK=item.Gsi1Sk, SK=item.Pk)` for each shared item
   - Owners: `BatchGet(PK=trackPk, SK=PROFILE)` for each unique track owner (deduplicated)
3. In-memory join: match tracks to owners, build `List<SharedTrack>`

#### `GET /users/{username}/shared` — GetTracksSharedFromUserLambda
1. `Query(GSI1, GSI1PK=SHARED#{requestor}, GSI1SK=USER#{username})` → shared items from specific sender
2. Same parallel BatchGet + join as above
