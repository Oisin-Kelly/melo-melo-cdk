# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MeloMelo is a serverless private music sharing and social platform backend built with AWS CDK in C#. It uses Lambda (native AOT on ARM64), DynamoDB (single-table design), Cognito, HTTP API v2, and S3.

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
```

Lambdas are built automatically during `cdk deploy` via Docker (`dotnet publish -c Release -r linux-arm64` with AOT). Each function's asset is scoped to the sources it compiles (its own folder + `Lambda.Shared` + `Ports`/`Adapters`/`Domain`, excluding `bin`/`obj`), so only Lambdas whose inputs changed get rebuilt — editing shared `Adapters/` code rebuilds everything, editing one Lambda rebuilds one. Bundling is sequential (CDK has no parallel-bundling option). Always run `cdk` from the repo root.

## Architecture

**Solution layout:** `MeloMelo.sln` at root.

- `infra/` — CDK stacks (.NET 10.0). Entry point: `Program.cs` orchestrates 6 stacks:
  - `data-stack` — DynamoDB table with GSI1, GSI2, and GSI3 (GSI2 reuses `GSI1PK` as its hash key with a distinct `GSI2SK` sort key; GSI3 has its own `GSI3PK`/`GSI3SK` keys, used for a user's own tracks, playlists, and albums newest-first)
  - `storage-stack` — S3 buckets (dropbox, private, public)
  - `lambda-stack` — HTTP API + Cognito trigger Lambda functions + IAM permissions
  - `auth-stack` — Cognito user pool + triggers
  - `sfn-stack` — Step Functions state machine, `ProcessTrackLambda`, and audio processing layers (owns `ProcessTrackLambda` to avoid a cross-stack dependency cycle with `lambda-stack`)
  - `api-stack` — HTTP API v2 routes + Cognito authorizer
- `api/` — Lambda code (.NET 10.0), hexagonal architecture:
  - `Domain/` — Entities: User, Track, UserFollow, SharedTrack, Playlist, Like, Album, ProcessTrack, PaginatedResult (+ the HTTP request records)
  - `Ports/` — Interfaces, split into `Repositories/` (namespace `Ports.Repositories` — IUserRepository, ITrackRepository, …), `Services/` (`Ports.Services` — IDynamoDBService, IS3Service, IAudioService, IImageService, IUserPoolService), and `Validation/` (`Ports.Validation` — the four I*ValidationService)
  - `Adapters/` — AWS implementations of Ports, mirroring the same split: `Repositories/` (`Adapters.Repositories`, incl. `TrackBatchLookup` + `UpdateExpressionBuilder`), `Services/` (`Adapters.Services`), `Validation/` (`Adapters.Validation`, incl. `InputSanitiser`). Namespaces match folders.
  - `Lambda/Lambda.Shared/` — Base handler with Ok/Accepted/Error response helpers
  - `Lambda/{Auth|User|Track|Playlist|Album}/*Lambda/` — Individual Lambda functions (each a separate executable), grouped by domain: `Auth/` (Cognito triggers), `User/` (profile + follows), `Track/` (tracks, upload pipeline, sharing, likes, segments, dropbox presign), `Playlist/`, `Album/`
  - `Lambda/Layers/` — Binary layer zips (ffmpeg, ffprobe — linux-arm64 static builds) for audio processing

**Lambda pattern:** Each Lambda has `Function.cs` (handler with `[LambdaFunction]`/`[HttpApi]` attributes, constructor DI), `Startup.cs` (DI registration via `[LambdaStartup]`), and AOT JSON serializer context. Step Function-invoked Lambdas (`ProcessTrackLambda`) skip `[HttpApi]` and `BaseLambdaFunctionHandler`, taking a plain input record and returning a plain output record.

Two Cognito trigger Lambdas (PostConfirmation, CheckEmailExistence), thirty-three HTTP API Lambdas (users, follows, tracks, playlists, likes, albums), and one Step Function-invoked Lambda (`ProcessTrackLambda`).

`DELETE /tracks/{trackId}` (owner-only) removes the track's whole footprint in retryable order: album memberships + their grants, S3 segments + cover, then direct shares/remaining grants/likes/upload status, and the Track item last. Playlist references (any user's) are left dangling on purpose — playlist reads drop tracks that no longer resolve.

Playback: `GET /tracks/{trackId}/segments` (`GetTrackSegmentsLambda`) returns 1-hour presigned GET URLs for the track's MP3 segments in the private bucket (`processed/{trackId}/segment_{i}.mp3`), gated on the standard track-access rule — the client streams directly from S3.

## Playlists, Likes & Albums

- **Playlists** are always private. Every user has a built-in likes playlist (reserved id `likes`, type `LIKES`, created at PostConfirmation) that cannot be renamed/deleted; custom playlists (type `CUSTOM`, server-generated ids) are editable and deletable. Playlists may contain any track the user can access.
- **Likes** are stored track-side (`TRACK#{id}` / `LIKE#{user}`) so owners can see who liked; `likeCount` lives on the Track item, maintained via `ADD` counter transactions with read-before-write idempotency (`LikeRepository`). `GET /tracks/{id}` returns `likedByMe` to any authorized viewer and `likeCount` to the owner only.
- **Albums** contain only the owner's own tracks and are the bulk-sharing mechanism: sharing an album grants recipients access to all its tracks via per-(track×recipient×album) grant records (`SHARED#{user}#ALBUM#{id}`, no GSI keys). Membership is live (adds fan out to existing recipients, removals revoke). Unshare/delete only touches `…#ALBUM#{id}` keys, so direct `SharedTrack` records always survive.
- **Track access rule** (single source: `ISharedTrackRepository.IsTrackAccessibleToUser`): owner OR direct share OR album grant. Use it for anything gated on track access.
- **Fan-out writes** use `IDynamoDBService.CreateBatchWritePart`/`ExecuteBatchWriteAsync` (SDK chunks to 25 + retries). Ordering rule: grants first, authoritative record (share/membership/meta) last, so failed operations retry cleanly. Limits: 50 tracks and 50 recipients per album.

## Track Upload Pipeline

`POST /tracks/upload` → `UploadTrackLambda` validates the request (title, audio key, recipients), verifies the staged audio object exists and is ≤300MB (`ITrackValidationService.ValidateUploadedAudioAsync` — HeadObject, synchronous 400 on failure; images are capped at 20MB inside `ImageService`), mints the `trackId`, writes an upload-status record (`USER#{user}` / `UPLOAD#{trackId}`, status `PROCESSING`, 24h TTL via the table's `expiresAt` attribute), then calls `StartExecutionAsync` on the `UploadTrackStateMachine` (Express) and returns `202 Accepted` with `{trackId, status}`. The state machine invokes `ProcessTrackLambda`, which downloads the audio from the dropbox bucket, uses the ffmpeg/ffprobe layers to segment the audio into MP3s (via ffmpeg's built-in libmp3lame), uploads segments to the private bucket, writes the `Track` + `SharedTrack` records transactionally, and marks the status `COMPLETE` — or `FAILED` with a user-safe reason (`ArgumentException` messages pass through, e.g. "not an audio file"; anything else becomes "Audio processing failed."). Clients poll `GET /tracks/uploads/{trackId}` (`GetUploadStatusLambda`) to observe the outcome. If the Lambda dies without reaching its catch block (OOM/timeout), the status sticks at `PROCESSING` — clients should treat a stale `PROCESSING` as failed.

Cross-stack wiring in `Program.cs`: `sfn.UploadTrackStateMachine.GrantStartExecution(lambda.UploadTrackFunction)` and `lambda.UploadTrackFunction.AddEnvironment("STATE_MACHINE_ARN", ...)`.

## DynamoDB Single-Table Design

Table: `melo-melo-table-{env}` with PK/SK composite keys, GSI1 (`GSI1PK`/`GSI1SK`), GSI2 (`GSI1PK`/`GSI2SK` — shares the hash key with GSI1 but sorts differently, so an item projected into both indices carries a single `GSI1PK` attribute and two sort attributes), and GSI3 (`GSI3PK`/`GSI3SK` — independent keys; used for the owner's newest-first listings of tracks (`USER#{u}`), playlists (`PLAYLISTS#{u}` — the likes playlist carries a max sentinel date so it always sorts first), and albums (`ALBUMS#{u}`)).

`IDynamoDBService.QueryPaginatedAsync` maps `indexName` → key attributes: `"GSI1"` → `(GSI1PK, GSI1SK)`, `"GSI2"` → `(GSI1PK, GSI2SK)`, `"GSI3"` → `(GSI3PK, GSI3SK)`, `null` → `(PK, SK)`.

**Adding a GSI requires three code changes** (the schema is registered manually for AOT — no runtime `DescribeTable`): the CDK table in `infra/DataStack.cs`, the `TableBuilder` registration in `DynamoDBService`'s constructor, and the `GetKeyAttributeNames` mapping. Missing the `TableBuilder` entry fails at runtime with "Unable to locate index".

Full schema, key patterns, and every API's access pattern chain are documented in [`docs/dynamo-access-patterns.md`](docs/dynamo-access-patterns.md).

## Environment Configuration

The `ENVIRONMENT` env var (default: "dev") controls stack naming and deletion policies (RETAIN for prod, DESTROY for dev). `BaseStack` provides this to all stacks.

## Lambda Layers

Binary layers (ffmpeg, ffprobe) are sourced from zip files at `api/Lambda/Layers/`. They are created as CDK `LayerVersion` assets in `StepFunctionStack.cs` and attached to `ProcessTrackLambda`. Binaries are referenced from `/opt/bin/{ffmpeg|ffprobe}` at runtime — do not use ARN environment variables for these layers.

The zips MUST contain **linux-arm64 (aarch64) static binaries** at the path `bin/<name>` inside the zip (so they land at `/opt/bin/<name>`). x86_64 binaries fail at runtime with "Exec format error" because the Lambda runs on ARM64. There is no separate lame layer — MP3 encoding uses ffmpeg's compiled-in libmp3lame.

## Validation Pattern

Input validation follows a hexagonal pattern:
- **Port**: `ITrackValidationService`, `IUserValidationService`, `IAlbumValidationService`, `IPlaylistValidationService` in `api/Ports/Validation/`
- **Adapter**: `TrackValidationService`, `UserValidationService`, `AlbumValidationService`, `PlaylistValidationService` in `api/Adapters/Validation/` using FluentValidation
- All services sanitise inputs (trim, collapse whitespace/newlines) before validating, mutate the request in place, and throw `ArgumentException` with a user-safe message (handlers catch it → 400)
- HTTP request records (`CreateAlbumRequest`, `UpdateTrackRequest`, …) live in `api/Domain/` alongside their entities so the Adapters-layer validators can see them
- `IUserRepository.GetValidatedRecipientsAsync` filters a `sharedWith` list to usernames that exist in DynamoDB (it lives on the repository because it owns the `USER#`/`PROFILE` key format)
- Shared sanitisation helpers live in `Adapters/Validation/InputSanitiser.cs` — use them instead of duplicating regexes

## Pagination

- Paginated reads return `PaginatedResult<T>` (`api/Domain/PaginatedResult.cs`) with `Items` and a nullable `NextCursor`.
- `IDynamoDBService.QueryPaginatedAsync` takes `pageSize` + `paginationToken` and returns `(Items, NextToken)`. Default is `scanIndexForward: false` (newest first).
- Cursors are opaque **base64url** strings (encoded/decoded inside `QueryPaginatedAsync`) — the raw SDK token is JSON with `#`/`{`/`"` characters that break unencoded query strings.
- HTTP handlers read `cursor` from `QueryStringParameters` and forward it verbatim; when there are no more pages, `NextCursor` is `null`.
- See `GetUserTracksLambda` + `TrackRepository.GetTracksByUsername` for the canonical pattern.

## Key Conventions

- All Lambdas use `PROVIDED_AL2023` runtime with `PublishAot: true` (native AOT, ARM64, 512MB memory)
- JSON serialization via `System.Text.Json` with AOT source-generated contexts
- Amazon.Lambda.Annotations for attribute-based routing and dependency injection
- HTTP responses: `202 Accepted` for async operations (Step Functions), `200 Ok` for reads, `201 Created` for synchronous resource creation
- No test projects exist currently
