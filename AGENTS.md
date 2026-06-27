# AGENTS.md

Guidance for AI coding agents working in this repository.

## Current State

This repo is a **UI-only mock** of OpenFusion Mission Control: a single Next.js app with typed domain models, state machines, a policy classifier, and mock data. There is no backend, bridge, workers, D1, R2, or real agent execution yet.

`Docs/IMPLEMENTATION_GUIDE_WITH_PI.md` describes the *planned* monorepo (`apps/`, `packages/`, `workers/`), but the actual repo is a flat Next.js app. Do not assume the monorepo exists. Trust the code, not the guide, for what is implemented today.

## Commands

```bash
npm run dev        # next dev (local dev server)
npm run build      # next build — current quality gate (includes TypeScript checking)
npm run start      # next start (serve production build)
npm run deploy     # opennextjs-cloudflare build && deploy to Cloudflare
npm run cf-typegen # regenerate cloudflare-env.d.ts from wrangler.jsonc bindings
```

- **`npm run lint` is broken.** Next.js 16 removed `next lint`. Use `npm run build` for type checking and linting. Do not add `eslint` CLI calls without fixing the script first.
- **No test framework is configured.** No test runner, no test files. The implementation guide describes a testing strategy, but nothing is wired up. Do not assume `npm test` works.
- Run `npm run build` before considering any task complete. It must pass cleanly. Add a real lint/test workflow before treating style or unit coverage as enforced.

## Architecture

### What exists

```
src/app/                              Next.js App Router shell
  layout.tsx                            Root layout, fonts, metadata
  page.tsx                              Renders MissionControlDashboard
  globals.css                           All dashboard styles (see CSS section)
src/components/openfusion/
  mission-control-dashboard.tsx         Entire UI in one 698-line file (intentional for mock phase)
src/lib/
  mock-openfusion.ts                    All mock data — keep mock data here
  openfusion-policy.ts                  classifyCommandRisk() + privacy storage decisions
  openfusion-state.ts                   Run/approval/terminal-lease state machines
src/types/
  openfusion.ts                         Domain types (the contract)
  openfusion-events.ts                  Event-sourced protocol types
```

### Key conventions

- **Path alias**: `@/*` maps to `./src/*`. Use it for all imports.
- **Types are the contract.** `src/types/openfusion.ts` and `src/types/openfusion-events.ts` define the domain model. Add shared types here before component-local shapes. The implementation guide rule "typed contracts come before backend implementation" is enforced.
- **State machines are authoritative.** `src/lib/openfusion-state.ts` defines legal transitions for `RunStatus`, `ApprovalStatus`, and `TerminalLeaseMode`. Use `transitionRunStatus()`, `transitionApprovalStatus()`, `transitionTerminalLease()` — do not invent new transitions or bypass these.
- **Policy classifier is authoritative.** `src/lib/openfusion-policy.ts` `classifyCommandRisk()` maps commands to `allow`/`approval`/`deny` + `RiskLevel`. Reuse it; do not duplicate risk logic.
- **Mock data stays in `src/lib/mock-openfusion.ts`.** Do not inline mock data in components. Do not introduce real provider calls, real fetch, or real auth into the mock UI.

## CSS and Styling

This is the most likely place to make a mistake.

- **The dashboard does NOT use Tailwind utility classes.** Tailwind v4 is imported (`@import "tailwindcss"`) but the entire UI uses **custom `of-` prefixed classes** defined in `src/app/globals.css`.
- **Design tokens are CSS variables** in `:root` (`--background`, `--foreground`, `--cyan`, `--violet`, `--amber`, `--green`, `--red`, `--panel`, `--border`, `--radius`, etc.). Reference these variables; do not hardcode hex values that duplicate tokens.
- **Color semantics**: cyan = active routing, violet = AI synthesis, amber = approval/waiting, green = verified/passed, red = blocked/failed. Color is always a secondary signal — never the only signal.
- **`@theme inline`** maps a subset of CSS vars into Tailwind's theme (`--color-background`, `--color-foreground`, `--font-sans`, `--font-mono`). Extend this only when you need Tailwind utilities to consume a token.
- **Responsive breakpoints**: `1240px` (collapse left nav to icons), `860px` (stack to single column). `prefers-reduced-motion` is respected.
- When adding UI, follow the existing `of-*` class pattern and add styles to `globals.css`. Do not introduce a new styling approach mid-stream.

## Product Principles (non-negotiable)

These are enforced by `CONTRIBUTING.md` and the architecture docs:

- **No auto-merge, git push, publish, or deploy by default.** These are `deny` in the policy classifier. Do not add hidden automation that bypasses this.
- **Local-first and privacy-mode controlled.** Raw terminal logs stay local unless the workspace privacy mode allows sync. Secrets are never read silently.
- **Risky commands require human approval.** The `classifyCommandRisk` output drives this.
- **Workers coordinate. The bridge executes. Humans approve.** Do not put execution logic in what should be a coordination layer.

## Commits

Follow conventional commits with scopes (established in git history and `CONTRIBUTING.md`):

```
feat(core): add run event types
feat(ui): build terminal dock
fix(ui): prevent mobile overflow
docs: add architecture blueprint
chore: update project metadata
```

- One focused slice per commit. Commit messages should explain the product or engineering slice.
- Do not commit unless explicitly asked. Do not push, merge, or open PRs unless explicitly asked.

## Cloudflare / OpenNext

- Deployment target is Cloudflare Workers via `@opennextjs/cloudflare`.
- `wrangler.jsonc` is the deploy config. `compatibility_date` is pinned to `2026-06-27`.
- `cloudflare-env.d.ts` is **generated** by `npm run cf-typegen`. Do not edit it by hand. Regenerate after changing `wrangler.jsonc` bindings.
- `next.config.ts` calls `initOpenNextCloudflareForDev()` to enable `getCloudflareContext()` in `next dev`.
- `.dev.vars` holds local secrets for dev (gitignored). `.dev.vars.example` is the template.

## Reference Docs

- `Docs/ARCHITECTURE_BLUEPRINT.md` — concise HLD/LLD baseline for the current milestone.
- `Docs/IMPLEMENTATION_GUIDE_WITH_PI.md` — full planned architecture (4172 lines). Source of truth for *intent*, not for *current state*.
- `CONTRIBUTING.md` — commit style, code standards, security defaults.
- `README.md` — product framing, tech stack, repo layout.
