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
npm test          # unit tests (Vitest + jsdom), once
npm run test:watch       # …re-running as you edit
npm run test:coverage    # …with a coverage report (coverage/)
```

## Unit tests

Vitest + jsdom + Testing Library, co-located as `*.test.ts(x)` beside what they test, with
shared helpers in `src/testing/`. No test touches AWS: the network is MSW (`testing/server.ts`)
and any request without a handler **fails the test** (`onUnhandledFrame: 'error'`); Amplify is
`vi.mock`ed where auth is involved; `sileo` toasts are a mock you assert on.

- `testing/providers.tsx` — `renderWithProviders` / `renderHookWithProviders` (QueryClient with
  no retries, a fake signed-in `AuthContext`, a `MemoryRouter`, Astryx links routed like the app),
  `renderRoutes` for a data router (needed by `useBlocker`), `LocationProbe` to assert redirects.
- `testing/fixtures.ts` — minimal valid API rows; `testing/stage-upload.ts` — the dropbox
  presign + S3 PUT, and a body-capturing handler; `testing/messages.ts` — assert a field error
  (Astryx also announces it in a hidden `role="alert"`, so plain `getByText` can see it twice).
- `testing/setup.ts` stands in for what jsdom lacks (`<dialog>`/popover, `matchMedia`, observers).
- `lib/links.ts` remembers slug → id in a module-level map: use unique slugs per test.
- Test files are type-checked by `tsconfig.test.json` (part of `tsc -b`, so `npm run build`),
  and CI runs lint + types + tests in the `web-tests` job before the e2e deploy.
- Locally this needs Node 22 or 24 (jsdom 26 is pinned because newer releases drop Node 23).

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
  folder instead. Current features: `auth`, `feed` (Home), `liked`, `albums`, `tracks`, `activity`, `playlists`, `search`, `users`, `invites` (the share-link screen at `/s/:token`, signed in or out).
- **Shared folders** — reusable, feature-agnostic building blocks:
  - `components/` — shared components: `brand/` (wordmark, gradient blobs),
    `feedback/` (`PageLoader`, `OnlineGate`), `illustrations/` (our own music-object SVGs, themed
    empty-state art), `lists/` (`InfiniteList`), `media/` (`CoverArt`, the shared track/album rows + track menu, `CollectionHeader`), `forms/` (`EditDetailsDialog`), `navigation/` (`BackButton`), `sharing/` (`ShareDialog`, used by albums and tracks, with its share-links section), `theme/` (light/dark/auto),
    `errors/`. The UI kit is Astryx itself (`@astryxdesign/core/*`), so there is
    deliberately **no `components/ui/`**.
  - `config/` — `env.ts`, the typed/validated env surface.
  - `lib/` — preconfigured libraries: `api-client.ts` (fetch wrapper → the HTTP
    API; `setAuthTokenProvider` / `setUnauthorizedHandler` seams), `react-query.ts`
    (the shared `QueryClient`), `auth/` (Amplify config + the session provider —
    shared because every feature needs the signed-in user), `likes.ts` (the one
    like mutation every heart uses, optimistic across all cached lists),
    `playlists.ts` (your playlists + add-to-playlist), `people.ts` (username search), `share-links.ts` (share links:
    the invite screen's calls, the owner's link management, the remembered invite) and `me.ts` (`useMe()`,
    the own-profile query the header and Home share).
  - `types/` — cross-cutting API shapes (`ErrorResponse`, `PaginatedResult`, the
    `UserSummary`/`TrackSummary`/`AlbumSummary` row DTOs, `User`).
  - `hooks/` (`useIsMobile`, `useLoadMoreOnScroll`), `utils/` (`format`) —
    `stores/`, `testing/`, `assets/` are created when first needed.

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
