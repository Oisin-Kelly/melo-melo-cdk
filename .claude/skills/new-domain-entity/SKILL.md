---
name: new-domain-entity
description: Scaffold a new DynamoDB domain entity with DataModel, port interface, and adapter repository
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Create a new domain entity

Before writing any code, ask the user:

1. What is the entity name? (e.g. "Playlist", "Comment")
2. What are its properties? (name, type, nullable?)
3. What DynamoDB key pattern should it use? (PK, SK, GSI1PK, GSI1SK values)
4. What repository operations are needed? (e.g. GetById, Create, Delete, Query by user)

**Wait for all answers before proceeding.**

Once you have the answers, follow the patterns in [templates.md](templates.md) and [dynamodb-patterns.md](dynamodb-patterns.md).

## Steps

1. Create domain record + DataModel in `api/Domain/{Entity}.cs`
2. Create port interface in `api/Ports/Repositories/I{Entity}Repository.cs`
3. Create adapter implementation in `api/Adapters/Repositories/{Entity}Repository.cs`
4. Document the new entity's key schema + access patterns in the matching domain file under `docs/data-model/` (users/tracks/playlists/albums/feed/activity — see [docs/data-model/README.md](../../../docs/data-model/README.md)); a genuinely new domain gets a new file added to the README index. Cross-cutting rules (counters, access, fan-out) live in the README.
5. Run `dotnet build MeloMelo.sln` to verify

## After creating the entity

The consuming Lambda needs:
- `builder.Services.AddTransient<I{Entity}Repository, {Entity}Repository>()` in its `Startup.cs`
- `[JsonSerializable(typeof({Entity}))]` in its `CustomJsonSerializerContext.cs`
