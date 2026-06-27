# OpenFusion Architecture Blueprint

This blueprint translates `Docs/IMPLEMENTATION_GUIDE_WITH_PI.md` into an implementation-oriented HLD/LLD baseline for the first open-source milestone.

## Product Thesis

OpenFusion is mission control for AI coding agents. It coordinates agents, terminals, worktrees, approvals, verification, queueing, schedules, and audit trails. It is not a replacement for Claude Code, Codex, OpenCode, Qwen Code, Pi, or future agents; it is the control plane above them.

Core promise:

```text
Watch agents work. Jump in anytime. Verify results. Approve before merge.
```

## High-Level Design

```text
Browser UI
  Observes runs, controls terminal leases, approves risky work, reviews reports.

Cloudflare Control Plane
  Coordinates sessions, WebSocket fanout, metadata, queues, schedules, artifacts,
  reports, provider policy, and audit.

Local OpenFusion Bridge
  Detects local agents, creates isolated worktrees, starts PTY processes, enforces
  policy, redacts secrets, runs verifiers, and streams events.

Agent Adapters
  Normalize Claude Code, Codex, OpenCode, Qwen Code, Pi, Aider, ACP, and future
  agents into the OpenFusion event model.
```

Boundary rule:

```text
Workers coordinate. The bridge executes. Agents run in terminals/worktrees.
Humans approve important actions.
```

## Low-Level Design

The core implementation should be built around five stable contracts:

1. `@openfusion/core`
   Domain types, event envelopes, state machines, reports, artifacts, and run lifecycle.

2. `@openfusion/bridge-protocol`
   Browser, Durable Object, Worker, and Bridge WebSocket/RPC payloads.

3. `@openfusion/policy`
   Privacy modes, command risk, provider allowlists, protected paths, approval rules.

4. `@openfusion/harness`
   Agent adapter interface, event normalization, steering/follow-up, terminal input.

5. `@openfusion/verifier`
   Build/test/lint/typecheck detection and deterministic evidence.

Dependency rule:

```text
UI -> core + bridge-protocol
Workers -> core + db + policy + ai
Bridge -> core + harness + policy + redaction + verifier
Adapters -> bridge primitives, not UI
```

## Event-Sourced Core

Every important action is represented as an event:

```text
session.created
run.started
terminal.stdout
message.assistant_delta
tool.start
approval.requested
verifier.completed
artifact.created
report.created
```

This supports live streaming, replay, reconnect, audit, decision reports, and queue history.

## MVP Scope

The first usable milestone should include:

```text
1. Mission Control UI with realistic typed mock data.
2. Agent inventory showing detected/missing/auth states.
3. Terminal dock with watch, jump-in, pause, resume, and audit states.
4. Approval queue and risk badges.
5. Verification stack and decision report preview.
6. Queue and schedule models.
7. Architecture docs and contribution-ready project framing.
```

Backend implementation follows in this order:

```text
1. Event schema and state machines.
2. Local bridge pairing and agent probe.
3. PTY streaming through a session hub.
4. Approval gates and policy classifier.
5. Worktree and verifier execution.
6. Queue, schedules, reports, and artifacts.
```

## UI Design System

OpenFusion should feel like a premium command center, not a chatbot:

```text
Theme: dark-first obsidian and graphite
Primary accent: electric cyan for live routing
Secondary accents: violet for synthesis, amber for approval, green for verified, red for blocked
Typography: clean sans UI, monospace terminal/code
Motion: state-driven, subtle, reduced-motion aware
Density: information-rich, compact, readable
```

UI architecture:

```text
AppShell
TopCommandBar
LeftNavigation
MissionCanvas
AgentGraph
RunTimeline
DecisionReportPanel
ApprovalQueue
VerificationStack
TerminalDock
AgentInventory
QueueBoard
SchedulePanel
PolicyMatrix
```

## Open-Source Engineering Rules

Code should stay easy to review:

```text
- TypeScript strict mode.
- Shared domain types before component-specific variants.
- Small focused components.
- Clear file names and component names.
- Mock data isolated from UI composition.
- No hidden provider calls in UI mock mode.
- No auto-merge or deploy behavior by default.
- Documentation updated with each meaningful architectural change.
```

Commit guidance:

```text
docs: add architecture blueprint
feat(core): add openfusion domain types and mock data
feat(ui): build mission control dashboard
chore: update project metadata and quality gates
```
