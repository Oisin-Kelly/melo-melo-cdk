---
name: new-api-lambda
description: Scaffold a new HTTP API Lambda function with Function.cs, Startup.cs, AOT serializer, csproj, infra stack wiring, and API route
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Create a new HTTP API Lambda

Before writing any code, ask the user:

1. What should the Lambda be called? (e.g. "GetPlaylist", "DeleteTrack")
2. What HTTP method and route path? (e.g. GET /playlists/{playlistId}, POST /tracks/{trackId}/share)
3. What should it do? (brief description of the business logic)
4. Which repositories/services does it need? (IUserRepository, ITrackRepository, ISharedTrackRepository, IImageService, IUserValidationService — or a new one?)
5. What domain types does it return in the response? (User, Track, SharedTrack, a new type, or a custom response record?)

**Wait for all answers before proceeding.**

Once you have the answers, follow the patterns in the reference files below.

## Steps

1. Create directory `api/Lambda/{Name}Lambda/`
2. Pick the closest `Function.cs` example from `templates/`:
   - [get-by-param.md](templates/get-by-param.md) — GET a single resource by path parameter
   - [get-for-caller.md](templates/get-for-caller.md) — GET the caller's own data (no path param, uses JWT)
   - [post-action.md](templates/post-action.md) — POST action/mutation with a request body and custom response
   - [post-update.md](templates/post-update.md) — POST partial update with multiple services (image processing etc.)
3. Create the remaining 4 files using [templates/boilerplate.md](templates/boilerplate.md)
4. Register DI services in Startup.cs using patterns from [di-patterns.md](di-patterns.md)
4. Add to `infra/ApiFunctions.cs` record
5. Add Lambda + IAM grants in `infra/LambdaStack.cs`
6. Add route in `infra/ApiStack.cs`
7. Add to solution: `dotnet sln MeloMelo.sln add api/Lambda/{Name}Lambda/{Name}Lambda.csproj`
8. Run `dotnet build MeloMelo.sln` to verify

## Important rules

- The `.csproj` must NOT have a `<PropertyGroup>` — all shared properties come from `api/Lambda/Directory.Build.props` and `api/Directory.Build.props`
- Every serialized/deserialized type MUST be in `CustomJsonSerializerContext` for AOT
- Authenticated username always comes from `request.RequestContext.Authorizer.Jwt.Claims["cognito:username"]`
- Use `BaseLambdaFunctionHandler` base class for `Ok()` and `Error()` helpers
- Use HTTP API v2 types (`APIGatewayHttpApiV2ProxyRequest/Response`), not REST API v1
- If the Lambda needs a new domain entity or repository, use `/new-domain-entity` first
