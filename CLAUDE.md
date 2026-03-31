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

# Deploy a specific stack
ENVIRONMENT=dev cdk deploy data-stack-dev

# Diff before deploying
cdk diff
```

Lambdas are built automatically during `cdk deploy` via Docker (`dotnet publish -c Release -r linux-arm64` with AOT).

## Architecture

**Solution layout:** `MeloMelo.sln` at root.

- `infra/` — CDK stacks (.NET 10.0). Entry point: `Program.cs` orchestrates 5 stacks:
  - `data-stack` — DynamoDB table with GSI1
  - `storage-stack` — S3 buckets (dropbox, private, public)
  - `lambda-stack` — All Lambda functions + IAM permissions
  - `auth-stack` — Cognito user pool + triggers
  - `api-stack` — HTTP API v2 routes + Cognito authorizer
- `api/` — Lambda code (.NET 10.0), hexagonal architecture:
  - `Domain/` — Entities: User, Track, UserFollow, SharedTrack
  - `Ports/` — Interfaces (IUserRepository, ITrackRepository, etc.)
  - `Adapters/` — AWS implementations of Ports
  - `Lambda/Lambda.Shared/` — Base handler with Ok/Error response helpers
  - `Lambda/*/` — 11 individual Lambda functions (each a separate executable)

**Lambda pattern:** Each Lambda has `Function.cs` (handler with `[LambdaFunction]`/`[HttpApi]` attributes, constructor DI), `Startup.cs` (DI registration via `[LambdaStartup]`), and AOT JSON serializer context.

Two Cognito trigger Lambdas (PostConfirmation, CheckEmailExistence) and nine HTTP API Lambdas.

## DynamoDB Single-Table Design

Table: `melo-melo-table-{env}` with PK/SK composite keys and GSI1 (GSI1PK/GSI1SK).

Full schema, key patterns, and every API's access pattern chain are documented in [`docs/dynamo-access-patterns.md`](docs/dynamo-access-patterns.md).

## Environment Configuration

The `ENVIRONMENT` env var (default: "dev") controls stack naming and deletion policies (RETAIN for prod, DESTROY for dev). `BaseStack` provides this to all stacks.

## Key Conventions

- All Lambdas use `PROVIDED_AL2023` runtime with `PublishAot: true` (native AOT, ARM64, 512MB memory)
- JSON serialization via `System.Text.Json` with AOT source-generated contexts
- Amazon.Lambda.Annotations for attribute-based routing and dependency injection
- No test projects exist currently
