# AGENTS.md

Guidance for AI coding agents working in this repository.

## Current State

This repo is a **pnpm monorepo** for OpenFusion Mission Control. It has typed domain models, event contracts, state machines, a policy classifier, D1 persistence contracts, runtime validators, mock data, and the production dashboard UI.

There is still no Worker API implementation, Durable Object session hub, local bridge, R2 write path, Queue consumer, Workflow, or real agent execution yet.

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
    src/components/openfusion/          Dashboard UI
    src/lib/mock-openfusion.ts          App-local mock data
    e2e/phase-00.spec.ts                Playwright wiring smoke test
    wrangler.jsonc                      Cloudflare deploy config
    cloudflare-env.d.ts                 Generated Cloudflare env types
packages/
  core/                                 Domain types, events, state machines
  policy/                               Command risk + privacy storage decisions
  db/                                   D1 repositories, input validators, migrations
  config/                               Shared tsconfig and ESLint presets
  bridge-protocol/                      Placeholder for Phase 03+ protocol schemas
  ui/                                   Placeholder for Phase 11 shared UI/tokens
infra/migrations/
  README.md                             Compatibility marker; canonical SQL is in packages/db/migrations
```

### Key conventions

- **Path alias**: `@/*` maps to `apps/web/src/*` and is only for app-local imports. Shared imports must use package facades.
- **Types are the contract.** `@openfusion/core` owns domain and event types. Add shared types there before app-local shapes.
- **State machines are authoritative.** `@openfusion/core` exports legal transitions for `RunStatus`, `ApprovalStatus`, and `TerminalLeaseMode`. Use `transitionRunStatus()`, `transitionApprovalStatus()`, `transitionTerminalLease()` — do not invent new transitions or bypass these.
- **Policy classifier is authoritative.** `@openfusion/policy` exports `classifyCommandRisk()` and privacy storage decisions. Reuse it; do not duplicate risk logic.
- **D1 repositories are the database boundary.** `@openfusion/db` exposes `createOpenFusionRepositories()`. Use it in future Worker/API code instead of writing ad hoc queries in handlers.
- **Runtime validators guard D1 inputs.** `@openfusion/db` exports zod validators for repository/API boundaries. Do not duplicate ad hoc validation in handlers.
- **Mock data stays in `apps/web/src/lib/mock-openfusion.ts`.** Do not inline mock data in components. Do not introduce real provider calls, real fetch, or real auth into the mock UI.
- **Dependency rule**: `@openfusion/core` depends on no other `@openfusion/*` package. `@openfusion/policy` and `@openfusion/db` may depend on `@openfusion/core`. Apps may depend on packages; packages must not depend on apps.

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
- D1 migration history lives in `packages/db/migrations`. Add a real `OPENFUSION_DB` binding with `migrations_dir: "../../packages/db/migrations"` after a D1 database is created.
- `apps/web/next.config.ts` calls `initOpenNextCloudflareForDev()` to enable `getCloudflareContext()` in `pnpm dev`.
- `.dev.vars` holds local secrets for dev (gitignored). `.dev.vars.example` and `apps/web/.dev.vars.example` are templates.

## Reference Docs

- `Docs/ARCHITECTURE_BLUEPRINT.md` — concise HLD/LLD baseline for the current milestone.
- `Docs/DATABASE_SCHEMA.md` — D1/R2 persistence schema, bindings, and repository usage.
- `Docs/IMPLEMENTATION_GUIDE_WITH_PI.md` — full planned architecture (4172 lines). Source of truth for *intent*, not for *current state*.
- `CONTRIBUTING.md` — commit style, code standards, security defaults.
- `README.md` — product framing, tech stack, repo layout.
