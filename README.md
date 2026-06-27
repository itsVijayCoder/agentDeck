# OpenFusion

OpenFusion is mission control for AI coding agents. It coordinates Claude Code, Codex CLI, OpenCode, Qwen Code, Pi, Aider, ACP agents, and future tools through visible terminal runs, human approval gates, deterministic verification, build queues, scheduled jobs, and decision reports.

OpenFusion is not auto-merge and not a black box.

```text
Watch agents work. Jump in anytime. Review before merge.
```

## Current Status

This repository currently contains the first product milestone:

- Architecture blueprint derived from `Docs/IMPLEMENTATION_GUIDE_WITH_PI.md`.
- Type-safe OpenFusion domain model and realistic mock data.
- Production-style Mission Control dashboard in Next.js.
- Local UI interactions for terminal tabs, command palette, approval state, and run inspection.

Backend services, bridge execution, Durable Objects, D1, R2, Queues, Workflows, and real agent adapters are planned next.

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

See [Docs/ARCHITECTURE_BLUEPRINT.md](Docs/ARCHITECTURE_BLUEPRINT.md) for the implementation-oriented HLD/LLD baseline.

## Tech Stack

- Next.js App Router
- React
- TypeScript strict mode
- Tailwind CSS
- OpenNext Cloudflare adapter
- Cloudflare Workers deployment target

Planned:

- Durable Objects for live session hubs
- D1 for metadata
- R2 for logs and artifacts
- Queues and Workflows for background runs
- Cron Triggers for schedules
- Local Node/Tauri OpenFusion Bridge

## Development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Start the production server after a build:

```bash
npm run start
```

## Quality Gates

Run before opening a pull request:

```bash
npm run build
```

The UI should also be smoke-tested in a browser at desktop and mobile widths. The current dashboard has been verified with production build rendering at `1440x1000` and `390x900`.

## Repository Layout

```text
Docs/
  Architecture and product implementation notes.

src/app/
  Next.js app shell, metadata, global design tokens, and route entry.

src/components/openfusion/
  Product UI components for Mission Control.

src/lib/
  Mock data shaped like future API responses.

src/types/
  Shared OpenFusion domain types.
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
