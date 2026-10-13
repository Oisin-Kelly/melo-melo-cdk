# MeloMelo web

React SPA for MeloMelo — Vite + TypeScript, built on the [Astryx design
system](./AGENTS.md) and organised with a
[bulletproof-react](https://github.com/alan2207/bulletproof-react) architecture.

## Scripts

```bash
npm run dev       # dev server (reads .env.local)
npm run build     # tsc -b && vite build  →  dist/
npm run lint      # oxlint
npm run preview   # serve the production build locally
```

## Environment

Copy `.env.example` → `.env.local` and fill from the deployed backend's CDK
outputs (`api-stack-{env}` → `ApiBaseUrl`, `auth-stack-{env}` →
`UserPoolClientId`). Access these **only** through `@/config/env` — never read
`import.meta.env` directly. `scripts/deploy-web.sh` (repo root) regenerates the
production env from stack outputs at deploy time.

## Architecture

Feature-based, with a **unidirectional dependency flow**. Code lives in one of
three layers and may only depend "downward":

```
shared (components, hooks, lib, config, types, utils)
   ▲ imported by
features/*            ← isolated; a feature must NOT import another feature
   ▲ imported by
app/                  ← wiring only; nothing may import back into app/
```

- **`app/`** — the application layer: global providers (`provider.tsx`), the
  router (`router.tsx`), the root (`app.tsx`), and route components
  (`routes/`). `app/` may import from anywhere below it; nothing imports from
  `app/`.
- **`features/<name>/`** — self-contained product modules. Each owns its
  `api/`, `components/`, `hooks/`, `stores/`, `types/`, `utils/` as needed.
  Cross-feature sharing is a smell — promote the shared piece up to a shared
  folder instead. (No features exist yet.)
- **Shared folders** — reusable, feature-agnostic building blocks:
  - `components/` — shared components (currently just `errors/`). The UI kit is
    Astryx itself (`@astryxdesign/core/*`), so there is deliberately **no
    `components/ui/`**.
  - `config/` — `env.ts`, the typed/validated env surface.
  - `lib/` — preconfigured libraries: `api-client.ts` (fetch wrapper → the HTTP
    API, with a `setAuthTokenProvider` seam for the future auth feature) and
    `react-query.ts` (the shared `QueryClient`).
  - `types/` — cross-cutting API shapes (`ErrorResponse`, `PaginatedResult`).
  - `hooks/`, `stores/`, `utils/`, `testing/`, `assets/` — created when first
    needed (not pre-stubbed).

Shared code must not import from `features/` or `app/`.

### Enforcement

Imports use the `@/` alias (→ `src/`), configured in `vite.config.ts` and
`tsconfig.app.json`. oxlint's `import` plugin enforces `no-cycle` and
`no-self-import`; the layer boundaries above are **convention** (oxlint doesn't
implement `import/no-restricted-paths`) — keep them in code review.

## Styling / components

Astryx rules are authoritative — see [`AGENTS.md`](./AGENTS.md). In short:
import components from per-category subpaths (`@astryxdesign/core/Button`),
style via component props → tokens, never raw `<div>`/hex/px, and build pages
from templates (`npx astryx build "<idea>"` → `npx astryx template <name>`).
The sole exception is `src/components/errors/main-error-fallback.tsx`, which
renders outside `<Theme>` and so uses plain HTML by design.

## Adding a route

Add a component under `src/app/routes/` and register it in
`src/app/router.tsx`. Lazy-load heavier screens with
`lazy: () => import('...')` to keep the initial bundle small.

## Adding a feature

Create `src/features/<name>/` with only the sub-folders it needs (`api/`,
`components/`, `hooks/`, …). Expose its routes to `src/app/router.tsx`. Keep all
of the feature's logic inside its folder; reach for shared folders only for
genuinely cross-feature code.
