# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MeloMelo is a serverless private music sharing and social platform built with AWS CDK in C#. The backend uses Lambda (native AOT on ARM64), DynamoDB (single-table design), Cognito, HTTP API v2, and S3. The frontend (`web/`) is a React SPA — Vite + TypeScript, built on the **Astryx design system** (`@astryxdesign/core` components + StyleX + the `theme-neutral` theme) — served from S3 + CloudFront by `web-stack`.

## Build & Deploy Commands

```bash
# Build CDK infrastructure
dotnet build infra/MeloMeloCdk.csproj

# Build all projects
dotnet build MeloMelo.sln

# Synthesize CloudFormation templates
cdk synth

# Deploy (set ENVIRONMENT=dev or prod)
ENVIRONMENT=dev cdk deploy --all

# Fast deploy when many lambdas changed (one docker run, parallel publishes,
# then bundling just copies the prebuilt binaries):
./scripts/build-lambdas.sh && USE_PREBUILT=1 ENVIRONMENT=dev cdk deploy --all

# Deploy a specific stack
ENVIRONMENT=dev cdk deploy data-stack-dev

# Diff before deploying
cdk diff

# Frontend: dev server (env from web/.env.local — copy web/.env.example, fill from cdk deploy outputs)
cd web && npm run dev

# Frontend: build + typecheck + lint
cd web && npm run build && npm run lint

# Frontend: build against deployed backend outputs + deploy web-stack
./scripts/deploy-web.sh
```

Lambdas are built automatically during `cdk deploy` via Docker (`dotnet publish -c Release -r linux-arm64` with AOT). Each function's asset is scoped to the sources it compiles (its own folder + `Lambda.Shared` + `Ports`/`Adapters`/`Domain`, excluding `bin`/`obj`), so only Lambdas whose inputs changed get rebuilt — editing shared `Adapters/` code rebuilds everything, editing one Lambda rebuilds one. Bundling is sequential (CDK has no parallel-bundling option). Always run `cdk` from the repo root.

## Architecture

**Solution layout:** `MeloMelo.sln` at root.

- `infra/` — CDK stacks (.NET 10.0). Entry point: `Program.cs` orchestrates 6 stacks:
  - `data-stack` — DynamoDB table with GSI1, GSI2, and GSI3 (GSI2 reuses `GSI1PK` as its hash key with a distinct `GSI2SK` sort key; GSI3 has its own `GSI3PK`/`GSI3SK` keys, used for a user's own tracks, playlists, and albums newest-first, plus the username search index)
  - `storage-stack` — S3 buckets (dropbox, private, public)
  - `lambda-stack` — HTTP API + Cognito trigger Lambda functions + IAM permissions
  - `auth-stack` — Cognito user pool + triggers
  - `sfn-stack` — Step Functions state machine, `ProcessTrackLambda`, and audio processing layers (owns `ProcessTrackLambda` to avoid a cross-stack dependency cycle with `lambda-stack`)
  - `api-stack` — HTTP API v2 routes + Cognito authorizer
  - `web-stack` — frontend hosting (private S3 bucket + CloudFront with OAC, SPA fallback 403/404 → index.html). Only instantiated when `web/dist` exists (its `Source.Asset` would otherwise break backend-only synth/deploys and CI) — build via `scripts/deploy-web.sh`
- `api/` — Lambda code (.NET 10.0), hexagonal architecture:
  - `Domain/` — Entities: User, Track, UserFollow, SharedTrack, Playlist, Like, Album, ProcessTrack, PaginatedResult (+ the HTTP request records)
  - `Ports/` — Interfaces, split into `Repositories/` (namespace `Ports.Repositories` — IUserRepository, ITrackRepository, …), `Services/` (`Ports.Services` — IDynamoDBService, IS3Service, IAudioService, IImageService, IUserPoolService), and `Validation/` (`Ports.Validation` — the four I*ValidationService)
  - `Adapters/` — AWS implementations of Ports, mirroring the same split: `Repositories/` (`Adapters.Repositories`, incl. `TrackBatchLookup` + `UpdateExpressionBuilder`), `Services/` (`Adapters.Services`), `Validation/` (`Adapters.Validation`, incl. `InputSanitiser`). Namespaces match folders.
  - `Lambda/Lambda.Shared/` — Base handler with Ok/Accepted/Error response helpers
  - `Lambda/{Auth|User|Track|Playlist|Album|Feed|Activity}/*Lambda/` — Individual Lambda functions (each a separate executable), grouped by domain: `Auth/` (Cognito triggers), `User/` (profile, follows, progress, seen markers), `Track/`, `Playlist/`, `Album/`, `Feed/` (home feed), `Activity/` (activity feed)
  - `Lambda/Layers/` — Binary layer zips (ffmpeg, ffprobe — linux-arm64 static builds) for audio processing
- `web/` — React SPA (Vite + TypeScript) built on the **Astryx design system**, organised as **bulletproof-react** (see `web/README.md` for the full structure). Two layers of conventions, both worth reading before touching frontend code:
  - **Architecture** (`web/README.md`): feature-based with a unidirectional flow `shared → features → app`. `src/app/` is wiring only (providers in `provider.tsx` = Suspense → ErrorBoundary → `<Theme>` → QueryClientProvider; router in `router.tsx`; routes in `app/routes/`). Shared folders: `config/` (typed env via `@/config/env`), `lib/` (`api-client.ts` fetch wrapper with a `setAuthTokenProvider` auth seam, `react-query.ts` QueryClient), `types/` (`ErrorResponse`, `PaginatedResult`), `components/` (no `ui/` — Astryx *is* the kit). Imports use the `@/` alias; oxlint enforces `import/no-cycle`, layer boundaries are convention. `features/*` don't exist yet.
  - **Astryx** (`web/AGENTS.md`): import components from per-category subpaths (`@astryxdesign/core/Button`), style via component props → tokens (`var(--color-*)`, `--spacing-*`, `--radius-*`) and never raw `<div>`/hex/px, build pages from templates (`npx astryx build "<idea>"` → `npx astryx template <name>`). Active theme `theme-neutral`, wired through the generated `src/astryx-themes.ts` + the `<Theme>` provider; base `reset.css`/`astryx.css` imported in `src/main.tsx`.
  - Stack: react-router v8 (data router) + TanStack Query. Currently a scaffold with a placeholder home + 404 route — product screens (auth, library, playback) are still to be built

**Lambda pattern:** Each Lambda has `Function.cs` (handler with `[LambdaFunction]`/`[HttpApi]` attributes, constructor DI), `Startup.cs` (DI registration via `[LambdaStartup]`), and AOT JSON serializer context. Step Function-invoked Lambdas (`ProcessTrackLambda`) skip `[HttpApi]` and `BaseLambdaFunctionHandler`, taking a plain input record and returning a plain output record.

Two Cognito trigger Lambdas (PostConfirmation, CheckEmailExistence), a growing set of HTTP API Lambdas (users, follows, tracks, playlists, likes, albums — including recipients endpoints), and one Step Function-invoked Lambda (`ProcessTrackLambda`).

`DELETE /tracks/{trackId}` (owner-only) removes the track's whole footprint in retryable order: album memberships + their grants, the S3 audio file + cover, then likes (each with a guarded transaction that also decrements the liker's likes-playlist `trackCount`/`totalDurationSeconds`), direct shares/remaining grants/upload status, and the Track item last. Playlist references (any user's) are left dangling on purpose — in a **custom** playlist they surface as removable `unavailable` placeholders (reason `DELETED` when the track is gone, `REVOKED` when access was withdrawn), rendered from the membership's denormalized name/duration; the likes playlist has no denormalized name, so deleted liked tracks are dropped. `GET /playlists/{id}` returns `tracks.items` as `PlaylistTrackEntry` (available entries carry the full `track`).

Playback: `GET /tracks/{trackId}/stream` (`GetTrackSegmentsLambda`) returns a single 6-hour presigned GET URL for the track's one processed AAC file in the private bucket (`processed/{trackId}/audio.m4a`, served `audio/mp4`), gated on the standard track-access rule — the client range-requests directly from S3 (the file is encoded with `+faststart` so seeking works without downloading the whole thing). The 6h expiry outlasts a single sitting; a resume days later just re-fetches. (The Lambda folder/construct keeps its `GetTrackSegments` name to avoid infra churn.)

## Playlists, Likes & Albums

- **Playlists** are always private. Every user has a built-in likes playlist (reserved id `likes`, type `LIKES`, created at PostConfirmation) that cannot be renamed/deleted; custom playlists (type `CUSTOM`, server-generated ids) are editable and deletable. Playlists may contain any track the user can access.
- **Cover images**: playlists and albums accept an optional `imageKey` on create/update (staged in the dropbox bucket), processed by `ImageService` to a 400×400 JPEG in the public bucket (`playlists/{id}/cover_400x400.jpg` / `albums/{id}/cover_400x400.jpg`) with a dominant-color hex (`imageBgColor`) — same flow as track covers and profile images. `clearedImage: true` on update removes them; deletes clean up the cover object.
- **Likes** (tracks and albums) are stored target-side (`TRACK#{id}`/`LIKE#{user}`, `ALBUM#{id}`/`LIKE#{user}`) so owners can see who liked; `likeCount` lives on the Track/Album item, maintained via `ADD` counter transactions with idempotency (read-before-write fast path + an `attribute_not_exists`/`attribute_exists` guard on the like record, run via `TryExecuteTransactWriteAsync` — a concurrent double like/unlike cancels the whole loser transaction, counters and activity included) (`LikeRepository` / `AlbumLikeRepository`). Detail reads return `likedByMe` to any authorized viewer and `likeCount` to the owner only. Album likes add `POST /albums/{id}/like`, `GET /albums/{id}/likes` (owner), `GET /albums/liked` (Library section); album likes are gated on album access (owner or recipient) and cleaned up on album deletion. Playlists have no likes (they're private).
- **Albums** contain only the owner's own tracks and are the bulk-sharing mechanism: sharing an album grants recipients access to all its tracks via per-(track×recipient×album) grant records (`SHARED#{user}#ALBUM#{id}`, no GSI keys). Membership is live (adds fan out to existing recipients, removals revoke). Unshare/delete only touches `…#ALBUM#{id}` keys, so direct `SharedTrack` records always survive.
- **Share captions & re-share (upsert)**: both `POST /tracks/{id}/share` and `POST /albums/{id}/share` take an optional `caption` (≤300, sanitised by the validation service) that lives on the per-recipient share record (`SharedTrackDataModel.Caption` / `AlbumShareDataModel.Caption`) and the feed item, surfacing on the shared-with lists and `/feed`. A share is an **upsert of one (target × recipient) row** — never a duplicate. The Lambdas pass the full `validatedAdds` (no pre-dedup); `ShareTrackAsync`/`ShareAlbumAsync` write **every** recipient in `add` (deliberate user action ⇒ always applied): a *new* recipient gets the full share (record + album grants + feed + activity + `shareCount +1`); an *existing* recipient is overwritten with the request's caption + a fresh `sharedAt` (resurfaces the feed/shared-list + a new activity item), grants untouched, `shareCount` unchanged. There is no same-caption short-circuit — re-sharing always resurfaces, and re-sharing without a caption overwrites the stored caption to null (send the caption to keep it). A recipient in both `add` and `remove` → remove wins. Only genuinely-new recipients move `shareCount`.
- **Counters**: albums carry `trackCount`/`totalDurationSeconds`/`shareCount`, playlists `trackCount`/`totalDurationSeconds` (on the likes playlist maintained by the like/unlike transaction — like records denormalize `duration` so unlike can decrement), tracks `shareCount` — all denormalized via `CounterExpressions.Add` `ADD` transactions, maintained on create/add/remove/share. `shareCount` (and track/album `likeCount`) are owner-only in responses; handlers null them for non-owners. Memberships denormalize `duration` so removals reconcile totals even for deleted tracks. `GET /albums/{id}/recipients` and `GET /tracks/{id}/recipients` (owner-only) return hydrated recipient `UserSummary`s for avatar stacks / manage-access.
- **Track editing & ordering**: memberships carry an explicit rank (`GSI1SK=ORDER#{rank}`, zero-padded, spaced 10 apart; required because Query sorts only by sort key), reads page ascending. Playlists are edited by *gestures*: `POST /playlists/{id}/tracks/{trackId}` adds one track (access-checked, sets `addedAt`, appends at max+10; re-adding an existing member is a no-op keeping position and `addedAt`), `DELETE /playlists/{id}/tracks/{trackId}` removes one (idempotent; deliberately no access check so revoked/deleted placeholders stay removable), and `PUT /playlists/{id}/tracks` `{trackIds}` (≤500) is the declarative reorder+remove save — every id must be a current member (adds only via the POST, keeping `addedAt` honest), omitted members are removed, ranks are rewritten 10/20/30… in list order with `addedAt` preserved. Albums are edited in *sessions*: `PUT /albums/{id}/tracks` `{trackIds}` (≤50, own tracks only, empty list clears) is the album's only track endpoint — the submitted list becomes the tracklist (new ids fan out grants to existing recipients, dropped ids revoke theirs, kept ids re-rank only). Both PUTs are last-write-wins on concurrent stale saves. The likes playlist rejects all of these (membership and like-history order are managed via the like endpoint).
- **Track access rule** (single source: `ISharedTrackRepository.IsTrackAccessibleToUser`): owner OR direct share OR album grant. Use it for anything gated on track access.
- **Remove from my library** (recipient-side, the mirror of the owner's unshare): `DELETE /tracks/shared/{trackId}` (`RemoveTrackFromLibraryAsync`) drops only the caller's direct `SharedTrack` record (+ its feed item) and `DELETE /albums/shared/{albumId}` (`RemoveAlbumFromLibraryAsync`) drops only the caller's album-share record + this-recipient album grants (+ feed item). Both are idempotent (no-op if the caller has no share; the share delete + feed delete + counter run as one transaction guarded on the share still existing, so concurrent double-removes decrement once) and decrement the owner's `shareCount` by 1 (keeps it equal to the live record count, so the re-share upsert — which treats a missing record as new — stays consistent). Because the two footprints are disjoint (`SHARED#{user}` vs `SHARED#{user}#ALBUM#{id}`), removing a track never touches album grants and removing an album never touches direct shares: a track that is **both** directly shared **and** in a shared album survives removal of either one, staying accessible via the other. Neither touches the "X shared with you" activity item (aged out by TTL like other unshares).
- **Home feed**: `FeedItem` (`FEED#{recipient}`, deterministic base SK `{TYPE}#{targetId}`) unifies tracks + albums shared with a user into one partition, projected into two date sorts: GSI1 (`DATE#{ts}`, all types interleaved) and GSI2 (`{TYPE}#DATE#{ts}`, one type isolated by a `begins_with` key condition — no `FilterExpression`). Written in the same batch/transaction as every share path (upload `sharedWith`, track share, album share) via the `FeedItems` helper and removed on every unshare/delete. `GET /feed` reads GSI1 (no `type` param) or GSI2 (`type=TRACK|ALBUM`) and hydrates track/album summaries + sender. Display-only, so feed drift on partial failure is tolerated like counters.
- **Activity feed**: per-recipient `ActivityItem` (`ACTIVITY#{recipient}`, descending `DATE#{ts}#{shortId}`, 90-day TTL) written recipient-perspective in the triggering write (via `ActivityItems`) on track/album-like (→ owner, no self-echo), track/album share (→ recipients), and **follow** (`USER_FOLLOWED` → followed user, no self-echo, `USER` target = the follower with no name to hydrate); album-track-adds grant access silently, no activity. `GET /activity` is a **live snapshot, not an event log**: it hydrates actor + target name and keeps a row only if the actor resolves, and (for like/share rows) the target resolves **and the exact relationship record that produced it still exists** (`KeyProbeDataModel` liveness probe of the direct `SHARED#{viewer}`/`LIKE#{actor}` record — *not* general access — whose `likedAt`/`sharedAt` must equal the row's `createdAt`, both written from the same `now`; so after unlike→re-like or a re-share only the newest row shows, older rows don't revive against the recreated key). So unshare/unlike/remove/delete all drop the row at read time; rows are only physically deleted for **follow activity** on unfollow: its SK is deterministic (`DATE#{followTs}#FOLLOW#{follower}`, no random `shortId`, built by `ActivityItems.BuildFollow`) so `UnfollowUser` can reconstruct + keyed-delete it from the follow record's `CreatedAt`; follow/unfollow write the activity as a 4th transaction part alongside the counter updates. `activitySeenAt` (bumped by `POST /me/activity-seen`, private, lives on `ActivityRepository`) badges unread. Listen-analytics events can slot into this entity later.
- **Resume progress**: `UserProgress` (`USER#{u}` / `PROGRESS#LATEST`, 30-day `expiresAt` TTL) is a single per-user resume slot, heartbeat-upserted via `PUT /me/progress` (any context overwrites it); `{completed: true}` deletes it when playback finishes so finished things stop offering to resume. `GET /me/progress` returns it if its track still resolves + is accessible (204 otherwise) — the app-open restore point, carrying `contextType`/`contextId`/`trackId`/`positionSeconds`. `lastSeenAt` on the profile (bumped by `POST /me/seen`, private to the owner) drives the new-since-last-visit divider client-side.
- **Incoming-shares setting**: each profile carries `incomingShares` (`EVERYONE` — default, written at signup — / `FOLLOWING` / `NONE`), set via `POST /profile/update`; unlike the other profile fields, omitting it (or sending null) leaves the stored setting unchanged. Enforced only in `GetValidatedRecipientsAsync` (the choke point for upload `sharedWith`, track share, album share): `FOLLOWING` requires the *recipient* to follow the sender at share time; recipients who don't accept are silently dropped like unknown usernames, so senders can't probe the setting. Existing shares/grants are never revoked by changing it, and album membership fan-out to existing recipients is deliberately not re-validated.
- **Fan-out writes** use `IDynamoDBService.CreateBatchWritePart`/`ExecuteBatchWriteAsync` (SDK chunks to 25 + retries). Ordering rule: grants first, authoritative record (share/membership/meta) last, so failed operations retry cleanly. Limits: 50 tracks and 50 recipients per album.

## Track Upload Pipeline

**Staging uploads (dropbox ownership):** `GET /buckets/dropbox?key={k}` presigns a PUT for `{username}/{k}` — the server prefixes the caller's username (`Domain/DropboxKeys`) and returns `{url, key}`; clients send that returned `key` as `audioKey`/`imageKey`. Every consumer rejects a staged key outside the caller's prefix with a 400 ("You can only use files you uploaded."): `ValidateUploadedAudioAsync(audioKey, username)` for audio, and `ImageService.ProcessImageAsync(ownerUsername, …)` for every cover/profile image (`UploadTrackLambda` also checks the track cover's prefix up front).

`POST /tracks/upload` → `UploadTrackLambda` validates the request (title, audio key, recipients), verifies the staged audio object exists and is ≤300MB (`ITrackValidationService.ValidateUploadedAudioAsync` — HeadObject, synchronous 400 on failure; images are capped at 20MB inside `ImageService`), mints the `trackId`, writes an upload-status record (`USER#{user}` / `UPLOAD#{trackId}`, status `PROCESSING`, 24h TTL via the table's `expiresAt` attribute), then calls `StartExecutionAsync` on the `UploadTrackStateMachine` (Standard — Express's hard 5-minute cap killed long encodes mid-flight; the binding limit is now `ProcessTrackLambda`'s 15-minute timeout, and the function runs at 1792MB for a full vCPU since the audio encoder is effectively single-threaded, with 10GB ephemeral storage for the input file + encoded output in `/tmp`) and returns `202 Accepted` with `{trackId, status}`. The state machine invokes `ProcessTrackLambda`, which downloads the audio from the dropbox bucket, probes it with ffprobe and rejects tracks longer than 24 hours (`AudioService.MaxDurationHours` — checked between probe and the expensive ffmpeg re-encode; when ffprobe reports no duration (`N/A`) the encode is capped with `-t` just past the limit and the output's duration is checked instead, so an unknown length never reads as 0; may become subscription-tier-dependent later), re-encodes it to a single continuous AAC file (`-c:a aac -b:a 192k -movflags +faststart`, via ffmpeg's built-in native `aac` encoder — no extra layer) uploaded to the private bucket as `processed/{trackId}/audio.m4a` (the source file is archived alongside as `processed/{trackId}/original`, only after a successful encode), writes the `Track` + `SharedTrack` records transactionally, and marks the status `COMPLETE` — or `FAILED` with a user-safe reason (`ArgumentException` messages pass through, e.g. "not an audio file" or the duration limit; anything else becomes "Audio processing failed."). Clients poll `GET /tracks/uploads/{trackId}` (`GetUploadStatusLambda`) to observe the outcome. If the Lambda dies without reaching its catch block (OOM/timeout), the status sticks at `PROCESSING` — clients should treat a stale `PROCESSING` as failed.

Cross-stack wiring in `Program.cs`: `sfn.UploadTrackStateMachine.GrantStartExecution(lambda.UploadTrackFunction)` and `lambda.UploadTrackFunction.AddEnvironment("STATE_MACHINE_ARN", ...)`.

## DynamoDB Single-Table Design

Table: `melo-melo-table-{env}` with PK/SK composite keys, GSI1 (`GSI1PK`/`GSI1SK`), GSI2 (`GSI1PK`/`GSI2SK` — shares the hash key with GSI1 but sorts differently, so an item projected into both indices carries a single `GSI1PK` attribute and two sort attributes), and GSI3 (`GSI3PK`/`GSI3SK` — independent keys; used for the owner's newest-first listings of tracks (`USER#{u}`), playlists (`PLAYLISTS#{u}` — the likes playlist carries a max sentinel date so it always sorts first), albums (`ALBUMS#{u}`), and followers (`FOLLOWERS#{u}`), plus the username search index on the profile item (`USERS` / `USERNAME#{lowercased username}`, queried alphabetically by `GET /users/search?q=` with `begins_with`; pre-existing profiles need `scripts/backfill-user-search-keys.sh`)).

`IDynamoDBService.QueryPaginatedAsync` maps `indexName` → key attributes: `"GSI1"` → `(GSI1PK, GSI1SK)`, `"GSI2"` → `(GSI1PK, GSI2SK)`, `"GSI3"` → `(GSI3PK, GSI3SK)`, `null` → `(PK, SK)`.

**Adding a GSI requires three code changes** (the schema is registered manually for AOT — no runtime `DescribeTable`): the CDK table in `infra/DataStack.cs`, the `TableBuilder` registration in `DynamoDBService`'s constructor, and the `GetKeyAttributeNames` mapping. Missing the `TableBuilder` entry fails at runtime with "Unable to locate index".

Full schema, key patterns, and every API's access pattern chain are documented in [`docs/data-model/`](docs/data-model/README.md), split by domain (users, tracks, playlists, albums, feed, activity) with cross-cutting rules in the index.

## Environment Configuration

The `ENVIRONMENT` env var (default: "dev") controls stack naming and deletion policies (RETAIN for prod, DESTROY for dev). `BaseStack` provides this to all stacks.

## Lambda Layers

Binary layers (ffmpeg, ffprobe) are sourced from zip files at `api/Lambda/Layers/`. They are created as CDK `LayerVersion` assets in `StepFunctionStack.cs` and attached to `ProcessTrackLambda`. Binaries are referenced from `/opt/bin/{ffmpeg|ffprobe}` at runtime — do not use ARN environment variables for these layers.

The zips MUST contain **linux-arm64 (aarch64) static binaries** at the path `bin/<name>` inside the zip (so they land at `/opt/bin/<name>`). x86_64 binaries fail at runtime with "Exec format error" because the Lambda runs on ARM64. There is no separate encoder layer — the AAC encode uses ffmpeg's built-in native `aac` encoder.

## Validation Pattern

Input validation follows a hexagonal pattern:
- **Port**: `ITrackValidationService`, `IUserValidationService`, `IAlbumValidationService`, `IPlaylistValidationService` in `api/Ports/Validation/`
- **Adapter**: `TrackValidationService`, `UserValidationService`, `AlbumValidationService`, `PlaylistValidationService` in `api/Adapters/Validation/` using FluentValidation
- All services sanitise inputs (trim, collapse whitespace/newlines) before validating, mutate the request in place, and throw `ArgumentException` with a user-safe message (handlers catch it → 400)
- HTTP request records (`CreateAlbumRequest`, `UpdateTrackRequest`, …) live in `api/Domain/` alongside their entities so the Adapters-layer validators can see them
- `IUserRepository.GetValidatedRecipientsAsync` filters a `sharedWith` list to usernames that exist in DynamoDB AND accept shares from the sender (it lives on the repository because it owns the `USER#`/`PROFILE` key format)
- Shared sanitisation helpers live in `Adapters/Validation/InputSanitiser.cs` — use them instead of duplicating regexes

## Pagination

- Paginated reads return `PaginatedResult<T>` (`api/Domain/PaginatedResult.cs`) with `Items` and a nullable `NextCursor`.
- `IDynamoDBService.QueryPaginatedAsync` takes `pageSize` + `paginationToken` and returns `(Items, NextToken)`. Default is `scanIndexForward: false` (newest first).
- Cursors are opaque **base64url** strings (encoded/decoded inside `QueryPaginatedAsync`) — the raw SDK token is JSON with `#`/`{`/`"` characters that break unencoded query strings.
- HTTP handlers read `cursor` from `QueryStringParameters` and forward it verbatim; when there are no more pages, `NextCursor` is `null`.
- The library listings (`GET /tracks`, `/tracks/shared`, `/playlists`, `/albums`, `/albums/shared`, `/albums/liked`) and `GET /users/search` accept an optional `limit` query param (default 10, clamped to 1–100 by `BaseLambdaFunctionHandler.ParseLimit`) so the client can pull larger pages for client-side search; other paginated endpoints keep fixed page sizes.
- See `GetUserTracksLambda` + `TrackRepository.GetTracksByUsername` for the canonical pattern.

## Key Conventions

- All Lambdas use `PROVIDED_AL2023` runtime with `PublishAot: true` (native AOT, ARM64, 512MB memory)
- JSON serialization via `System.Text.Json` with AOT source-generated contexts
- Amazon.Lambda.Annotations for attribute-based routing and dependency injection
- HTTP responses: `202 Accepted` for async operations (Step Functions), `200 Ok` for reads, `201 Created` for synchronous resource creation
- **Summary DTOs** (`api/Domain/Summaries.cs`): every list/row context serializes `UserSummary` (`{username, displayName, imageUrl, imageBgColor}`), `TrackSummary`, or `AlbumSummary` (both with a non-null `likedByMe` + `owner: UserSummary`); full `User`/`Track`/`Album` appear only on their detail GETs (+ create/update echoes). Owner-only counts (`likeCount`/`shareCount`) exist only on the full objects. `TrackBatchLookup.GetTrackSummariesAsync` is the shared track-row join (tracks + deduped owners + viewer like-status in one parallel BatchGet round); `AlbumLikeRepository.GetLikedAlbumIdsAsync` is the album equivalent.
- The track title is JSON `name` everywhere (upload request, update request, Track/TrackSummary responses); the DynamoDB attribute stays `trackName`.
- All JSON is camelCase, including `ErrorResponse` (`{statusCode, message, error}`).
- No test projects exist currently
