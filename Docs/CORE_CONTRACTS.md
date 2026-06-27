# OpenFusion Core Contracts

This document describes the first reusable product core added after the initial Mission Control UI.

## Purpose

The UI, Worker API, Durable Object session hub, and Local Bridge need one shared understanding of:

```text
- event envelopes
- browser control messages
- bridge messages
- run lifecycle transitions
- approval lifecycle transitions
- terminal lease transitions
- command risk decisions
- privacy-mode storage behavior
```

These contracts should remain small, typed, and framework-independent.

## Files

```text
src/types/openfusion-events.ts
  Event envelope, event catalog, browser control messages, and bridge messages.

src/lib/openfusion-state.ts
  Run, approval, and terminal lease state-machine helpers.

src/lib/openfusion-policy.ts
  Command risk classifier, privacy storage matrix, and approval requirement helper.
```

## Event Envelope

Every meaningful action should flow through an `EventEnvelope`.

```text
id
seq
workspaceId
sessionId
runId
source
type
payload
visibility
createdAt
hash
traceId
```

The `seq` field is owned by the Durable Object session hub for live sessions. The bridge can send events without final sequence numbers; the session hub assigns ordering before fanout and persistence.

## Event Catalog

The current catalog covers:

```text
session.*
machine.*
agent.*
run.*
message.*
terminal.*
tool.*
approval.*
verifier.*
artifact.*
queue.*
schedule.*
judge.*
synthesis.*
report.*
```

The UI should consume normalized OpenFusion events, not native Claude Code, Codex, OpenCode, Qwen Code, Pi, or ACP event names.

## State Machines

Run state transitions are intentionally conservative:

```text
draft -> queued | running | cancelled
queued -> waiting-machine | running | cancelled
waiting-machine -> running | cancelled
running -> waiting-approval | paused | verifying | completed | failed | cancelled
waiting-approval -> running | paused | failed | cancelled
paused -> running | cancelled
verifying -> running | completed | failed | cancelled
completed | failed | cancelled -> terminal
```

Approval decisions are one-way:

```text
pending -> approved | rejected | expired
approved | rejected | expired -> terminal
```

Terminal leases are explicit:

```text
agent-control <-> human-control
agent-control <-> read-only
human-control <-> read-only
```

The bridge must audit human terminal input while a human-control lease is active.

## Policy Model

Command decisions return:

```text
decision: allow | approval | deny
risk: low | medium | high | critical
reason: human-readable policy reason
```

Default behavior:

```text
allow
  read-only commands and deterministic verification

approval
  unknown commands, dependency installs, network scripts, protected paths,
  database changes, and infrastructure operations

deny
  git push, merge, publish, deploy-class critical actions, sudo, destructive
  shell commands, and credential access until an explicit workspace policy exists
```

## Privacy Storage Matrix

```text
local-only
  D1: metadata
  R2: blocked
  live stream: local relay
  provider calls: local only

metadata-only
  D1: metadata
  R2: redacted
  live stream: encrypted cloud
  provider calls: approval required

full-sync
  D1: metadata
  R2: full
  live stream: encrypted cloud
  provider calls: policy controlled
```

## Backend Integration Path

Next backend slices should be implemented in this order:

```text
1. D1 migrations matching the domain model.
2. Durable Object session hub that assigns event sequence numbers.
3. Worker API endpoints for sessions, approvals, agents, queue, schedules, and reports.
4. Local Bridge probe command that emits agent.detected events.
5. PTY runner that emits terminal.* events.
6. Approval gate that blocks risky policy decisions.
7. Verifier runner that emits verifier.* and artifact.* events.
```

## Design Constraints

```text
- No UI package should depend on native agent event names.
- No Worker should spawn local processes.
- No Bridge module should depend on React components.
- No raw terminal logs should bypass privacy-mode decisions.
- No run should push, merge, publish, or deploy without explicit human approval.
```
