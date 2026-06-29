# AGENTS.md

Guidance for AI coding agents working in this repository.

## Current State

This repo is a **pnpm monorepo** for AgentDeck Mission Control. It has typed domain models, event contracts, state machines, a policy classifier, D1 persistence contracts, runtime validators, Worker API routes, a Durable Object session hub, Cloudflare Queue/Workflow/Cron orchestration for queued runs and schedules, the local bridge, terminal jump-in control, harness adapter contracts, agent event normalization, approval-gated command policy services, isolated worktree helpers, verifier strategies, patch/artifact upload plumbing, mock data, and the production dashboard UI.

Phase 08 now provides the first cloud-dispatched single-agent queue flow: API-created and scheduled queue items are sent to `AGENTDECK_QUEUE`, the queue consumer starts `RunWorkflow`, Cron checks due schedules, the workflow dispatches through SessionHub to a connected bridge, and the bridge creates an isolated worktree before starting the selected adapter. Later phases still own multi-agent orchestration, judge/synthesis flows, provider routing, advanced reports, and premium UI.

`Docs/IMPLEMENTATION_GUIDE_WITH_PI.md` describes the full planned architecture. Trust the code and current phase docs for what is implemented today.

## Commands

```bash
pnpm install        # install/link all workspace packages
pnpm dev            # apps/web next dev
pnpm typecheck      # pnpm -r typecheck
pnpm lint           # pnpm -r lint
pnpm test           # pnpm -r test
pnpm test:e2e       # apps/web Playwright skeleton
pnpm build:packages # build all packages
pnpm build          # apps/web next build
pnpm start          # apps/web next start
pnpm deploy         # apps/web OpenNext deploy to Cloudflare
pnpm cf-typegen     # regenerate apps/web/cloudflare-env.d.ts
```

- This repository uses pnpm workspaces. Do not reintroduce `package-lock.json` or npm-only scripts.
- `pnpm lint` uses the ESLint CLI directly because Next.js 16 removed `next lint`.
- `pnpm test` runs package-level Vitest suites with V8 coverage thresholds for shared contracts.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` before considering any task complete. Run `pnpm build:packages` when package exports or build config changed.

## Architecture

### What exists

```text
apps/
  web/                                  Next.js/OpenNext Mission Control app
    src/app/                            App Router shell, fonts, metadata, global CSS
    src/app/api/                        Worker API/BFF routes, including SessionHub WebSocket gate
    src/components/agentdeck/          Dashboard UI
    src/do/                             SessionHub Durable Object + protocol helpers
    src/lib/mock-agentdeck.ts          App-local mock data
    src/workers/                       Queue consumer, scheduler, RunWorkflow, morning reports
    e2e/phase-00.spec.ts                Playwright wiring smoke test
    wrangler.jsonc                      Cloudflare deploy config
    cloudflare-env.d.ts                 Generated Cloudflare env types
packages/
  core/                                 Domain types, events, state machines
  harness/                              Agent adapter SDK, registry, event draft helpers
  policy/                               Command risk + privacy storage decisions
  verifier/                             Test/build/lint/typecheck detector strategies
  db/                                   D1 repositories, input validators, migrations
  config/                               Shared tsconfig and ESLint presets
  bridge-protocol/                      Shared SessionHub protocol roles/messages/constants
  ui/                                   Placeholder for Phase 11 shared UI/tokens
infra/migrations/
  README.md                             Compatibility marker; canonical SQL is in packages/db/migrations
```

### Key conventions

- **Path alias**: `@/*` maps to `apps/web/src/*` and is only for app-local imports. Shared imports must use package facades.
- **Types are the contract.** `@agentdeck/core` owns domain and event types. Add shared types there before app-local shapes.
- **State machines are authoritative.** `@agentdeck/core` exports legal transitions for `RunStatus`, `ApprovalStatus`, and `TerminalLeaseMode`. Use `transitionRunStatus()`, `transitionApprovalStatus()`, `transitionTerminalLease()` — do not invent new transitions or bypass these.
- **Policy classifier is authoritative.** `@agentdeck/policy` exports `classifyCommandRisk()` and privacy storage decisions. Reuse it; do not duplicate risk logic.
- **Verifier strategies are shared.** `@agentdeck/verifier` owns language/tool detection and deterministic test/lint/typecheck/build command execution. Bridge code should use it instead of ad hoc verifier commands.
- **D1 repositories are the database boundary.** `@agentdeck/db` exposes `createAgentDeckRepositories()`. Use it in future Worker/API code instead of writing ad hoc queries in handlers.
- **Runtime validators guard D1 inputs.** `@agentdeck/db` exports zod validators for repository/API boundaries. Do not duplicate ad hoc validation in handlers.
- **Mock data stays in `apps/web/src/lib/mock-agentdeck.ts`.** Do not inline mock data in components. Do not introduce real provider calls, real fetch, or real auth into the mock UI.
- **Dependency rule**: `@agentdeck/core` depends on no other `@agentdeck/*` package. `@agentdeck/policy` and `@agentdeck/db` may depend on `@agentdeck/core`. Apps may depend on packages; packages must not depend on apps.

## CSS and Styling

This is the most likely place to make a mistake.

- **The dashboard does NOT use Tailwind utility classes.** Tailwind v4 is imported (`@import "tailwindcss"`) but the entire UI uses **custom `of-` prefixed classes** defined in `apps/web/src/app/globals.css`.
- **Design tokens are CSS variables** in `:root` (`--background`, `--foreground`, `--cyan`, `--violet`, `--amber`, `--green`, `--red`, `--panel`, `--border`, `--radius`, etc.). Reference these variables; do not hardcode hex values that duplicate tokens.
- **Color semantics**: cyan = active routing, violet = AI synthesis, amber = approval/waiting, green = verified/passed, red = blocked/failed. Color is always a secondary signal — never the only signal.
- **`@theme inline`** maps a subset of CSS vars into Tailwind's theme (`--color-background`, `--color-foreground`, `--font-sans`, `--font-mono`). Extend this only when you need Tailwind utilities to consume a token.
- **Responsive breakpoints**: `1240px` (collapse left nav to icons), `860px` (stack to single column). `prefers-reduced-motion` is respected.
- When adding UI, follow the existing `of-*` class pattern and add styles to `apps/web/src/app/globals.css`. Do not introduce a new styling approach mid-stream.

## Product Principles (non-negotiable)

These are enforced by `CONTRIBUTING.md` and the architecture docs:

- **No auto-merge, git push, publish, or deploy by default.** These are `deny` in the policy classifier. Do not add hidden automation that bypasses this.
- **Local-first and privacy-mode controlled.** Raw terminal logs stay local unless the workspace privacy mode allows sync. Secrets are never read silently.
- **Risky commands require human approval.** The `classifyCommandRisk` output drives this.
- **Workers coordinate. The bridge executes. Humans approve.** Do not put execution logic in what should be a coordination layer.

## Commits

Follow conventional commits with scopes (established in git history and `CONTRIBUTING.md`):

```text
feat(core): add run event types
feat(ui): build terminal dock
fix(ui): prevent mobile overflow
docs: add architecture blueprint
chore: update project metadata
```

- One focused slice per commit. Commit messages should explain the product or engineering slice.
- Do not push, merge, or open PRs unless explicitly asked.

## Cloudflare / OpenNext

- Deployment target is Cloudflare Workers via `@opennextjs/cloudflare`.
- `apps/web/wrangler.jsonc` is the deploy config. `compatibility_date` is pinned to `2026-06-27`.
- `apps/web/cloudflare-env.d.ts` is **generated** by `pnpm cf-typegen`. Do not edit it by hand. Regenerate after changing `apps/web/wrangler.jsonc` bindings.
- D1 migration history lives in `packages/db/migrations`. Add a real `AGENTDECK_DB` binding with `migrations_dir: "../../packages/db/migrations"` after a D1 database is created.
- `apps/web/next.config.ts` calls `initOpenNextCloudflareForDev()` to enable `getCloudflareContext()` in `pnpm dev`.
- `.dev.vars` holds local secrets for dev (gitignored). `.dev.vars.example` and `apps/web/.dev.vars.example` are templates.

## Reference Docs

- `Docs/ARCHITECTURE_BLUEPRINT.md` — concise HLD/LLD baseline for the current milestone.
- `Docs/DATABASE_SCHEMA.md` — D1/R2 persistence schema, bindings, and repository usage.
- `Docs/IMPLEMENTATION_GUIDE_WITH_PI.md` — full planned architecture (4172 lines). Source of truth for *intent*, not for *current state*.
- `CONTRIBUTING.md` — commit style, code standards, security defaults.
- `README.md` — product framing, tech stack, repo layout.

<!-- BEGIN:nextjs-agent-rules -->

## Next.js Agent Rules (v16.2)

This project uses **Next.js 16.2 (App Router)** deployed to Cloudflare Workers via `@opennextjs/cloudflare`. Your training data is outdated for this version. **Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/**`.**

Key docs to consult before writing code:

- `01-app/01-getting-started/05-server-and-client-components.md` — Server vs Client Component rules
- `01-app/01-getting-started/06-fetching-data.md` — data fetching, streaming, `Suspense`, `use` API
- `01-app/01-getting-started/07-mutating-data.md` — Server Functions, Server Actions, forms
- `01-app/01-getting-started/08-caching.md` — Cache Components, `use cache`, PPR streaming model
- `01-app/01-getting-started/09-revalidating.md` — `revalidateTag` (2-arg), `updateTag`, `refresh`
- `01-app/01-getting-started/10-error-handling.md` — `error.tsx`, `not-found.tsx`, `forbidden.tsx`, `unauthorized.tsx`
- `01-app/01-getting-started/15-route-handlers.md` — `route.ts` handlers
- `01-app/02-guides/upgrading/version-16.md` — breaking changes from v15
- `01-app/02-guides/ai-agents.md` — how the AGENTS.md / bundled docs pattern works
- `01-app/03-api-reference/` — full API reference for directives, file conventions, functions, config

### Version-specific breaking changes (v16)

These differ from your training data. Heed them strictly.

**Async Request APIs (mandatory).** Synchronous access was removed in v16:

```tsx
// params and searchParams are Promises — must await them
// ✅ Correct (v16)
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const query = await searchParams
  // ...
}

// cookies() and headers() are async — must await them
const cookieStore = await cookies()
const headersList = await headers()
```

Use the `PageProps<'/path/[param]'>` and `LayoutProps<'/path/[param]'>` type helpers generated by `pnpm next typegen` (run from `apps/web/`) for type-safe async params.

**`middleware` → `proxy`.** The `middleware.ts` filename is deprecated and the `edge` runtime is not supported in `proxy`:

- Rename `middleware.ts` → `proxy.ts`
- Export `proxy` (not `middleware`)
- `proxy` runtime is `nodejs` only (cannot be configured)
- `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`

**Turbopack by default.** `next dev` and `next build` use Turbopack. Do not add `--turbopack`/`--turbo` flags. If a `webpack` config exists in `next.config.ts`, builds fail — use `--webpack` to opt out or migrate to `turbopack` top-level config:

```ts
// next.config.ts — config promoted from experimental.turbopack
turbopack: { /* options */ }
```

**`next lint` removed.** Use ESLint CLI directly. The `eslint` option in `next.config.ts` is also removed.

**PPR via `cacheComponents`.** `experimental.ppr` and `experimental_ppr` route segment config are removed. Enable PPR with:

```ts
cacheComponents: true
```

**Caching APIs changes:**

- `revalidateTag(tag)` now requires a second argument: `revalidateTag(tag, 'max')`
- `updateTag(tag)` — new Server-Actions-only API for read-your-writes semantics
- `refresh()` — new, refreshes client router from a Server Action
- `cacheLife` / `cacheTag` — stable, no `unstable_` prefix
- `use cache` directive — caches async functions/components at data-level or UI-level

### Server vs Client Components

- **Layouts and pages are Server Components by default.** They can be `async`, fetch data directly, and access backend resources.
- **Add `'use client'` only for interactivity** — `useState`, `useEffect`, `onClick`, browser APIs.
- Keep Client Components as leaf nodes. Push data fetching to Server parents and pass serializable props down.
- Use `Suspense` boundaries to stream uncached/runtime-dependent components.
- For context providers, wrap them in a `'use client'` component that accepts `children`.

### Data fetching

- Fetch in Server Components using `async`/`await` or `fetch`. `React.cache()` deduplicates per-request.
- `fetch` is NOT cached by default in v16. Use `'use cache'` or `cacheLife` to opt into caching.
- Components that access runtime APIs (`cookies`, `headers`, `searchParams`, `params` without `generateStaticParams`) MUST be wrapped in `<Suspense>`.
- Stream slow fetches with `<Suspense fallback={...}>` or `loading.tsx`.

### Route Handlers (`route.ts`)

- Export named functions: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- When `cacheComponents: true`, `GET` handlers follow the same prerendering model as pages.

### Server Functions / Server Actions

- Mark with `'use server'` at file top or inside async function body.
- Can be called from forms (`action` prop), event handlers, or `useEffect`.
- Always authenticate/authorize inside Server Functions — they are reachable via direct POST.
- `useActionState` for pending state; call `revalidatePath`/`updateTag` to refresh UI; `redirect` after mutation.

### Routing

- File conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`.
- New: `forbidden.tsx` (403) and `unauthorized.tsx` (401).
- Parallel route slots (`@modal`, etc.) require explicit `default.tsx` files.
- `params` is `Promise<{…}>` in `layout.tsx`, `page.tsx`, `route.ts`, `default.tsx`, and metadata image files.

### Cloudflare / OpenNext specifics

- `next.config.ts` calls `initOpenNextCloudflareForDev()` — required for `getCloudflareContext()` in dev.
- The project uses `@opennextjs/cloudflare`; do not introduce Vercel-specific patterns or `vercel.json`.
- `transpilePackages` includes all `@agentdeck/*` workspace packages.

<!-- END:nextjs-agent-rules -->
