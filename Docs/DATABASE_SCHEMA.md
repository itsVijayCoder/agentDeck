# OpenFusion Database Schema

This document describes the first Cloudflare D1 persistence slice for OpenFusion Mission Control.

## Scope

The database layer stores control-plane metadata only:

```text
D1
  Workspaces, machines, detected agent installations, sessions, runs,
  event indexes, approvals, queue items, scheduled jobs, artifact metadata,
  decision report metadata, and policy rules.

R2
  Raw event streams, terminal ANSI logs, transcripts, patches, verifier output,
  full decision report JSON, and any other large or sensitive payload.
```

The boundary is intentional: D1 remains queryable and small, while R2 holds append-heavy or large artifacts governed by workspace privacy mode.

## Files

```text
packages/db/migrations/0001_openfusion_core.sql
  Initial D1 schema, constraints, foreign keys, and indexes.

packages/db/src/types/openfusion-db.ts
  Raw D1 row types and camelCase repository input contracts.

packages/db/src/repositories.ts
  Prepared-statement repository factory for Worker/API code.

packages/db/src/validators.ts
  Runtime zod validation for D1 repository input contracts.
```

## Tables

```text
workspaces
  Workspace name, repository pointer, default branch, privacy mode.

machines
  Paired local bridge machines, bridge version, status, heartbeat metadata.

agent_installations
  Detected Claude Code, Codex, OpenCode, Qwen Code, Pi, Aider, or ACP adapters.

sessions
  Mission Control sessions, parent session pointer for branching, privacy mode.

runs
  Individual agent attempts tied to a session, queue item, schedule, machine, and agent.

event_index
  Ordered event metadata for replay and reconnect. The object_key points to R2 when payloads are not inline.

approvals
  Human approval requests and immutable decision metadata.

queue_items
  Deferred or overnight work items before they become runs.

scheduled_jobs
  Recurring natural-language jobs resolved into run templates.

artifacts
  R2 object metadata for patches, verifier output, transcripts, and related files.

decision_reports
  Queryable report summary plus optional R2 key for the full report body.

policy_rules
  Workspace-level allow, approval, and deny rules.
```

## R2 Layout

Use stable object keys so D1 rows can point to content without storing large blobs:

```text
workspaces/{workspaceId}/sessions/{sessionId}/events/{runId}.jsonl.zst
workspaces/{workspaceId}/sessions/{sessionId}/terminal/{runId}.ansi.zst
workspaces/{workspaceId}/sessions/{sessionId}/transcripts/{runId}.jsonl.zst
workspaces/{workspaceId}/sessions/{sessionId}/artifacts/{artifactId}/patch.diff
workspaces/{workspaceId}/sessions/{sessionId}/artifacts/{artifactId}/verifier-output.txt
workspaces/{workspaceId}/reports/{reportId}.json
workspaces/{workspaceId}/queue/{date}/morning-summary.md
```

## Wrangler Binding

After creating the Cloudflare resources, add real IDs to `apps/web/wrangler.jsonc`:

```jsonc
{
	"d1_databases": [
		{
			"binding": "OPENFUSION_DB",
			"database_name": "openfusion-control",
			"database_id": "d5243135-2e7c-48d7-8e45-82470791e1eb",
			"migrations_dir": "../../packages/db/migrations"
		}
	],
	"r2_buckets": [
		{
			"binding": "OPENFUSION_ARTIFACTS",
			"bucket_name": "openfusion-artifacts"
		}
	]
}
```

Then regenerate environment types:

```bash
pnpm cf-typegen
```

## Applying Migrations

Local:

```bash
pnpm --filter @openfusion/web wrangler d1 migrations apply openfusion-control --local
```

Remote:

```bash
pnpm --filter @openfusion/web wrangler d1 migrations apply openfusion-control --remote
```

## Repository Usage

Worker/API code should use `createOpenFusionRepositories()` instead of hand-written queries in route handlers:

```ts
import { createOpenFusionRepositories } from "@openfusion/db";

export async function createSession(env: { OPENFUSION_DB: D1Database }) {
	const db = createOpenFusionRepositories(env.OPENFUSION_DB);

	return db.sessions.create({
		id: crypto.randomUUID(),
		workspaceId: "workspace_01",
		title: "Refactor auth flow",
		privacyMode: "metadata-only",
		createdBy: "user_01",
	});
}
```

Rules:

```text
- Use prepared statements and bound values only.
- Store large payloads in R2 and keep object_key references in D1.
- Keep event ordering scoped by (session_id, seq).
- Keep raw terminal data out of D1.
- Apply privacy-mode storage decisions before writing R2 content.
- Regenerate Cloudflare env types after adding real bindings.
```
