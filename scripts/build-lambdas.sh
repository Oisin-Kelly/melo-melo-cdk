#!/bin/bash
# Builds all Lambda functions in ONE docker container, writing native AOT bootstrap
# binaries to api/.build/{Name}/bootstrap.
#
# Two phases (both inside the same container):
#   1. Parallel MSBuild Build via PublishLambdas.proj — shared projects (Domain, Ports,
#      Adapters, Lambda.Shared) compile exactly once, lambdas compile in parallel.
#   2. Parallel `dotnet publish --no-build` per lambda — the publish CLI flow is the only
#      thing that triggers Native AOT (ILC); --no-build prevents shared-project rebuild races.
#
# Use together with USE_PREBUILT=1 so cdk deploy consumes these binaries instead of
# running one docker build per function:
#
#   ./scripts/build-lambdas.sh && USE_PREBUILT=1 ENVIRONMENT=dev cdk deploy --all
#
# PARALLEL controls build/publish concurrency (default 4 — AOT compilation is memory
# hungry; raise it only if the docker VM has RAM to spare).
set -euo pipefail
cd "$(dirname "$0")/.."

PARALLEL="${PARALLEL:-4}"
IMAGE="public.ecr.aws/sam/build-dotnet10:latest"

docker run --rm \
  -v "$PWD/api":/src \
  -v melo-melo-nuget-cache:/root/.nuget \
  -w /src \
  "$IMAGE" \
  /bin/sh -c "
    set -e
    # Sequential CLI restore with the target RID — the only restore mode that
    # dependably writes linux-arm64 assets; sequential because every lambda's
    # restore graph includes the shared projects (parallel restores race on
    # their project.assets.json)
    # Lambdas live under domain group folders (Lambda/{Group}/{Name}); Lambda.Shared
    # and Layers stay top-level, so the two-level glob only needs a prefix guard
    for dir in Lambda/*/*/; do
      case \"\$dir\" in Lambda/Lambda.Shared/*|Lambda/Layers/*) continue;; esac
      dotnet restore \"\$dir\" -r linux-arm64 --verbosity quiet
    done

    # Warm parallel build: shared projects end up fully up-to-date, so the parallel
    # publishes below don't race each other rebuilding them
    dotnet msbuild PublishLambdas.proj -t:BuildAll -m:$PARALLEL -v:minimal

    # Full dotnet publish per lambda — the publish CLI flow is the only thing that
    # triggers Native AOT compilation (ILC)
    # no-restore: BuildAll already restored with this RID; parallel implicit restores
    # race each other writing shared projects' project.assets.json
    ls -d Lambda/*/*/ | grep -v 'Lambda.Shared\|Layers' | xargs -P $PARALLEL -I {} \
      dotnet publish {} -c Release -r linux-arm64 --self-contained true --no-restore -v:quiet

    mkdir -p .build
    for dir in Lambda/*/*/; do
      case \"\$dir\" in Lambda/Lambda.Shared/*|Lambda/Layers/*) continue;; esac
      name=\$(basename \"\$dir\")
      bin=\"\${dir}bin/Release/net10.0/linux-arm64/publish/bootstrap\"
      if [ ! -f \"\$bin\" ]; then
        echo \"ERROR: \$name produced no publish/bootstrap\" >&2
        exit 1
      fi
      # A real AOT binary is megabytes; ~80KB means the managed apphost launcher,
      # which cannot run on Lambda (fails with 'bootstrap.dll does not exist')
      size=\$(stat -c%s \"\$bin\")
      if [ \"\$size\" -lt 1000000 ]; then
        echo \"ERROR: \$name bootstrap is only \${size} bytes — not a native AOT binary\" >&2
        exit 1
      fi
      mkdir -p \".build/\$name\"
      cp \"\$bin\" \".build/\$name/bootstrap\"
      echo \"built \$name (\$size bytes)\"
    done
  "

echo "done — binaries in api/.build/"
