---
name: add-gsi
description: Add a new Global Secondary Index to the DynamoDB single-table design — CDK, runtime schema registration, key mapping, item writes, backfill, and deploy order
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Add a new GSI

A new index touches **three code locations plus the writers**. Missing any one fails at runtime, not at build time.

## 1. The three mandatory code changes

1. **CDK table** — `infra/DataStack.cs`: `table.AddGlobalSecondaryIndex(...)` with the new key attributes (`GSInPK`/`GSInSK`, both STRING, projection ALL).
2. **Runtime schema registration** — `api/Adapters/Services/DynamoDBService.cs` constructor: add `.AddGlobalSecondaryIndex("GSIn", "GSInPK", ..., "GSInSK", ...)` to the `TableBuilder`. **This codebase never calls `DescribeTable` at runtime (AOT)** — the SDK only knows indices registered here. Forgetting this fails with `Unable to locate index [GSIn] on table [...]` and no amount of redeploying/recycling containers fixes it.
3. **Key attribute mapping** — `GetKeyAttributeNames` in the same file: `"GSIn" => ("GSInPK", "GSInSK")`. `QueryPaginatedAsync` builds its `QueryFilter` from this.

Note GSI2 is special: it reuses `GSI1PK` as its hash key. A brand-new index should get its own attribute pair unless it deliberately shares a partition with GSI1.

## 2. Writers and data model

- Add `[DynamoDBGlobalSecondaryIndexHashKey("GSIn", AttributeName = "GSInPK")]` / range-key properties (nullable `string?`) to the item's DataModel record in `api/Domain/`.
- Set the new attributes everywhere the item is created (repositories, `ProcessTrackLambda` pipeline, etc.). For date-sorted feeds use the established pattern: `DATE#{unixMillis}` sort values, query with `BeginsWith "DATE#"`, `scanIndexForward: false`.

## 3. Existing items need a backfill

A new GSI only contains items that have the key attributes. Existing items are invisible to the index until backfilled (`UpdateItem` adding the two attributes; keys never change, nothing else is touched). **Present the backfill script to the user before running it** — for dev they may prefer wiping the environment instead (e2e fixtures recreate test users via signup, which re-runs PostConfirmation).

## 4. Deploy order and gotchas

1. `ENVIRONMENT=dev cdk deploy data-stack-dev` **first** — must run from the repo root (`cdk` silently prints `--app is required` from elsewhere, and piping to `tail` masks the exit code).
2. Wait for the index: `aws dynamodb describe-table --table-name melo-melo-table-{env} --query "Table.GlobalSecondaryIndexes[].{name:IndexName,status:IndexStatus}"` → `ACTIVE`.
3. Then deploy the code that queries it: `cdk deploy lambda-stack-dev sfn-stack-dev`.

## 5. Documentation

Update the index list and the affected item-type table + access-pattern entries in `docs/dynamo-access-patterns.md`, and the GSI descriptions in `CLAUDE.md`.

## Remember about GSI semantics

- GSI queries are **eventually consistent** — never read an item back through a GSI right after writing it (return the write, or `GetItem` on the base table; this exact bug produced stale album names).
- Base-table SK order is only meaningful if the SK encodes it — `TRACK#{guid}` sorts in random GUID order, which is why date-ordered listings need an index in the first place.
