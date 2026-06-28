# OpenFusion

OpenFusion is mission control for AI coding agents. It coordinates Claude Code, Codex CLI, OpenCode, Qwen Code, Pi, Aider, ACP agents, and future tools through visible terminal runs, human approval gates, deterministic verification, build queues, scheduled jobs, and decision reports.

OpenFusion is not auto-merge and not a black box.

```text
Watch agents work. Jump in anytime. Review before merge.
```

## Current Status

This repository currently contains the first product milestone:

- Architecture blueprint derived from `Docs/IMPLEMENTATION_GUIDE_WITH_PI.md`.
- pnpm monorepo with shared `core`, `policy`, `db`, and `config` packages.
- Type-safe OpenFusion domain model and realistic mock data.
- D1 schema migration plus typed repository contracts for the control-plane metadata layer.
- Production-style Mission Control dashboard in Next.js.
- Local UI interactions for terminal tabs, command palette, approval state, and run inspection.

Worker API routes, Durable Objects, bridge execution, R2 object writes, Queues, Workflows, and real agent adapters are planned next.

## Product Architecture

```text
Browser UI
  Observe runs, approve risky actions, jump into terminals, review reports.

Cloudflare Control Plane
  Coordinate sessions, events, queues, schedules, metadata, artifacts, and audit.

Local OpenFusion Bridge
  Detect agents, create worktrees, run PTYs, enforce policy, redact secrets, verify output.

Agent Adapters
  Normalize Claude Code, Codex, OpenCode, Qwen Code, Pi, Aider, ACP, and custom agents.
```

Core rule:

```text
Workers coordinate. The local bridge executes. Humans approve important actions.
```

See [Docs/ARCHITECTURE_BLUEPRINT.md](Docs/ARCHITECTURE_BLUEPRINT.md) for the implementation-oriented HLD/LLD baseline, [Docs/CORE_CONTRACTS.md](Docs/CORE_CONTRACTS.md) for the shared event/state/policy contracts, and [Docs/DATABASE_SCHEMA.md](Docs/DATABASE_SCHEMA.md) for D1/R2 persistence.

## Tech Stack

- Next.js App Router
- React
- TypeScript strict mode
- pnpm workspaces
- Tailwind CSS
- OpenNext Cloudflare adapter
- Cloudflare Workers deployment target
- Cloudflare D1 schema and repository contracts

Planned:

- Durable Objects for live session hubs
- R2 write path for logs and artifacts
- Queues and Workflows for background runs
- Cron Triggers for schedules
- Local Node/Tauri OpenFusion Bridge

## Development

Install dependencies:

```bash
pnpm install
```

Run the dev server:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
```

Start the production server after a build:

```bash
pnpm start
```

## Quality Gates

Run before opening a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

The UI should also be smoke-tested in a browser at desktop and mobile widths. The current dashboard has been verified with production build rendering at `1440x1000` and `390x900`.

## Repository Layout

```text
Docs/
  Architecture and product implementation notes.

infra/migrations/
  Compatibility marker. Canonical D1 migrations live in packages/db/migrations.

apps/web/
  Next.js app shell, metadata, global design tokens, route entry, mock UI, and OpenNext config.

packages/core/
  Shared domain types, event contracts, and state machines.

packages/policy/
  Command risk classifier and privacy storage decisions.

packages/db/
  D1 row/input contracts, zod validators, repositories, tests, and migrations.

packages/config/
  Shared TypeScript and ESLint presets.
```

## Open-Source Principles

- Local code is private by default.
- No auto-merge, git push, publish, or deploy by default.
- Risky actions require explicit human approval.
- Typed contracts come before backend implementation.
- Changes should be small, reviewable, and documented.
- Commit messages should explain the product or engineering slice.

## License

No license has been selected yet. Add a license before accepting external contributions.
