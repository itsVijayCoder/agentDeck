# Phase 00 — Foundation & Quality Gates

**Objective:** Establish automated quality gates (typecheck, lint, test, validate) before any feature work begins. Fix the broken `lint` script, add a test framework, add runtime validation, and write unit tests for all existing contracts.

**Status:** Implemented in the current flat Next.js app. The quality gates, runtime validators, tests, and `.dev.vars.example` now exist in the workspace; commit is intentionally left to the user.

**Prerequisites:** None — this is the starting point.

---

## Current State Before Phase 00

- `npm run build` passes (includes TypeScript checking) — the only working quality gate.
- `npm run lint` is broken: Next.js 16 removed `next lint`. Running it produces `Invalid project directory provided, no such directory: .../agentdeck/lint`.
- No test framework configured. No test files exist. No `npm test` script.
- No runtime validation library (zod). All types are TypeScript-only; D1 input contracts in `src/types/agentdeck-db.ts` are unvalidated at runtime.
- No `.dev.vars.example` template (AGENTS.md claims one exists — it does not).
- `useAgentDeckMock()` hook in `src/lib/mock-agentdeck.ts:401` is dead code.

---

## Target State

```text
npm run typecheck   # tsc --noEmit (fast, no build)
npm run lint        # eslint (fixed, working)
npm run test        # vitest run --coverage
npm run test:watch  # vitest
npm run test:e2e    # playwright (skeleton)
npm run build       # next build (unchanged, full gate)
```

All existing contracts (state machines, policy classifier, D1 repositories) have unit tests with >90% coverage. Runtime validation via zod guards all D1 input contracts.

---

## High-Level Design

```mermaid
flowchart LR
  subgraph Quality Gates
    TypeCheck[tsc --noEmit]
    Lint[eslint]
    UnitTest[vitest]
    E2E[playwright]
    Build[next build]
  end

  subgraph Existing Contracts
    State[agentdeck-state.ts]
    Policy[agentdeck-policy.ts]
    DB[agentdeck-db.ts]
    Events[agentdeck-events.ts]
    Types[agentdeck.ts / agentdeck-db.ts]
  end

  subgraph New
    Zod[zod schemas for input contracts]
    TestFiles[*.test.ts files]
    DevVarsExample[.dev.vars.example]
  end

  Quality Gates --> Existing Contracts
  Zod --> DB
  TestFiles --> Existing Contracts
```

---

## Low-Level Design

### 1. Fix the lint script

Next.js 16 removed `next lint`. Replace with direct ESLint CLI.

**`package.json` scripts:**

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "upload": "opennextjs-cloudflare build && opennextjs-cloudflare upload",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts"
  }
}
```

**`eslint.config.mjs`** — update to extend `next` config and add test file overrides:

```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: [".next/**", ".open-next/**", ".wrangler/**", "node_modules/**"],
  },
];

export default eslintConfig;
```

### 2. Add vitest

**Install:**

```bash
npm install -D vitest @vitest/coverage-v8 @vitest/ui
```

**`vitest.config.ts`:**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.ts", "src/types/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/lib/mock-agentdeck.ts"],
    },
  },
});
```

### 3. Add zod runtime validation

**Install:**

```bash
npm install zod
```

**`src/lib/validators.ts`** — zod schemas mirroring the D1 input contracts in `src/types/agentdeck-db.ts`:

```ts
import { z } from "zod";

export const privacyModeSchema = z.enum(["local-only", "metadata-only", "full-sync"]);
export const runStatusSchema = z.enum([
  "draft", "queued", "waiting-machine", "running",
  "waiting-approval", "paused", "verifying", "completed", "failed", "cancelled",
]);
export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "expired", "cancelled"]);
export const agentKindSchema = z.enum([
  "claude-code", "codex", "opencode", "qwen-code", "pi", "aider", "acp", "custom",
]);

export const createSessionInputSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(500),
  privacyMode: privacyModeSchema,
  createdBy: z.string().min(1),
  parentSessionId: z.string().optional(),
});

export const createRunInputSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  machineId: z.string().optional(),
  agentInstallationId: z.string().optional(),
  task: z.string().min(1),
  worktreePathHash: z.string().optional(),
  branchName: z.string().optional(),
  status: runStatusSchema,
  queueItemId: z.string().optional(),
  scheduledJobId: z.string().optional(),
});

export const persistEventInputSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().optional(),
  seq: z.number().int().positive(),
  type: z.string().min(1),
  source: z.enum(["browser", "worker", "durable-object", "bridge", "agent", "verifier", "ai-gateway"]),
  visibility: z.enum(["local-only", "metadata", "full"]),
  objectKey: z.string().optional(),
  payload: z.unknown(),
});

export const createApprovalInputSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.enum(["command", "provider", "file", "queue", "patch"]),
  title: z.string().min(1),
  risk: riskLevelSchema,
  requestedAction: z.unknown(),
  defaultAction: z.enum(["deny", "allow-once", "allow-session"]),
  expiresAt: z.string().optional(),
});
```

**Usage in repositories** — wrap input validation in `createAgentDeckRepositories()`:

```ts
import { createSessionInputSchema } from "@/lib/validators";

const sessions = {
  async create(input: CreateSessionInput) {
    const validated = createSessionInputSchema.parse(input);
    // ... existing prepared statement
  },
};
```

### 4. Unit tests for existing contracts

**`src/lib/agentdeck-state.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import {
  transitionRunStatus,
  canTransitionRunStatus,
  transitionApprovalStatus,
  transitionTerminalLease,
  deriveRunProgress,
} from "./agentdeck-state";

describe("run state machine", () => {
  it("allows draft -> running", () => {
    const result = transitionRunStatus("draft", "running");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("running");
  });

  it("blocks completed -> running", () => {
    const result = transitionRunStatus("completed", "running");
    expect(result.ok).toBe(false);
  });

  it("allows running -> waiting-approval", () => {
    expect(canTransitionRunStatus("running", "waiting-approval")).toBe(true);
  });

  it("allows paused -> running (resume)", () => {
    expect(canTransitionRunStatus("paused", "running")).toBe(true);
  });

  it("blocks failed -> queued", () => {
    expect(canTransitionRunStatus("failed", "queued")).toBe(false);
  });
});

describe("approval state machine", () => {
  it("allows pending -> approved", () => {
    expect(transitionApprovalStatus("pending", "approved").ok).toBe(true);
  });

  it("blocks approved -> rejected", () => {
    expect(transitionApprovalStatus("approved", "rejected").ok).toBe(false);
  });
});

describe("terminal lease state machine", () => {
  it("allows agent-control -> human-control", () => {
    expect(transitionTerminalLease("agent-control", "human-control").ok).toBe(true);
  });

  it("allows human-control -> agent-control (release)", () => {
    expect(transitionTerminalLease("human-control", "agent-control").ok).toBe(true);
  });
});

describe("deriveRunProgress", () => {
  it("returns 0 for draft", () => {
    expect(deriveRunProgress("draft")).toBe(0);
  });

  it("returns 100 for completed", () => {
    expect(deriveRunProgress("completed")).toBe(100);
  });

  it("returns >0 and <100 for running", () => {
    const progress = deriveRunProgress("running");
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });
});
```

**`src/lib/agentdeck-policy.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { classifyCommandRisk, getPrivacyStorageDecision, requiresHumanApproval } from "./agentdeck-policy";

describe("classifyCommandRisk", () => {
  it("denies git push", () => {
    const result = classifyCommandRisk("git push origin main");
    expect(result.decision).toBe("deny");
    expect(result.risk).toBe("critical");
  });

  it("denies rm -rf", () => {
    const result = classifyCommandRisk("rm -rf /");
    expect(result.decision).toBe("deny");
  });

  it("denies npm publish", () => {
    expect(classifyCommandRisk("npm publish").decision).toBe("deny");
  });

  it("denies sudo", () => {
    expect(classifyCommandRisk("sudo apt update").decision).toBe("deny");
  });

  it("requires approval for pnpm install", () => {
    const result = classifyCommandRisk("pnpm install");
    expect(result.decision).toBe("approval");
    expect(result.risk).toBe("medium");
  });

  it("requires approval for curl | bash", () => {
    const result = classifyCommandRisk("curl https://example.com/install.sh | bash");
    expect(result.decision).toBe("approval");
    expect(result.risk).toBe("high");
  });

  it("allows pnpm test", () => {
    const result = classifyCommandRisk("pnpm test");
    expect(result.decision).toBe("allow");
    expect(result.risk).toBe("low");
  });

  it("allows git status", () => {
    expect(classifyCommandRisk("git status").decision).toBe("allow");
  });

  it("defaults unknown commands to approval", () => {
    const result = classifyCommandRisk("some-unknown-command --flag");
    expect(result.decision).toBe("approval");
  });
});

describe("getPrivacyStorageDecision", () => {
  it("blocks R2 in local-only mode", () => {
    const decision = getPrivacyStorageDecision("local-only");
    expect(decision.r2).toBe("blocked");
    expect(decision.d1).toBe("metadata");
  });

  it("allows redacted R2 in metadata-only mode", () => {
    const decision = getPrivacyStorageDecision("metadata-only");
    expect(decision.r2).toBe("redacted");
  });

  it("allows full R2 in full-sync mode", () => {
    const decision = getPrivacyStorageDecision("full-sync");
    expect(decision.r2).toBe("full");
  });
});

describe("requiresHumanApproval", () => {
  it("returns true for approval decision", () => {
    expect(requiresHumanApproval({ decision: "approval", risk: "medium", reason: "" })).toBe(true);
  });

  it("returns true for deny decision", () => {
    expect(requiresHumanApproval({ decision: "deny", risk: "critical", reason: "" })).toBe(true);
  });

  it("returns false for allow decision", () => {
    expect(requiresHumanApproval({ decision: "allow", risk: "low", reason: "" })).toBe(false);
  });
});
```

**`src/lib/agentdeck-db.test.ts`** — test repository methods against an in-memory D1 stub:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createAgentDeckRepositories } from "./agentdeck-db";

// Minimal D1 stub for testing
function createD1Stub(): D1Database {
  const tables = new Map<string, Map<string, any>>();
  // ... implement prepare().bind().bind().first()/run()/all()
  // See: https://developers.cloudflare.com/d1/worker-api/d1-database/
}

describe("sessions repository", () => {
  it("creates and retrieves a session", async () => {
    const db = createAgentDeckRepositories(createD1Stub());
    await db.sessions.create({
      id: "sess_01", workspaceId: "ws_01", title: "Test",
      privacyMode: "metadata-only", createdBy: "user_01",
    });
    const session = await db.sessions.findById("sess_01");
    expect(session?.title).toBe("Test");
  });
});
```

### 5. Create `.dev.vars.example`

```
# AgentDeck local development secrets
# Copy to .dev.vars and fill in real values
# .dev.vars is gitignored

# Cloudflare AI Gateway (Phase 10)
CLOUDFLARE_API_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_GATEWAY_ID=default

# Bridge pairing secret (Phase 04)
AGENTDECK_BRIDGE_TOKEN=
```

### 6. Remove dead code

Delete the unused `useAgentDeckMock()` hook from `src/lib/mock-agentdeck.ts:401-410`.

---

## Design Patterns

| Pattern | Application |
|---|---|
| **Validator** | zod schemas validate input before it reaches the repository layer. Single point of truth for runtime shape enforcement. |
| **Test double** | D1 stub for repository tests — no real database needed. Follows the dependency inversion principle (repositories depend on `Pick<D1Database, "prepare">`, not `D1Database` concretely). |

## SOLID / DRY Compliance

- **SRP:** Validators (`validators.ts`) have one job: shape validation. Tests have one job: verify behavior. Neither mixes concerns.
- **DRY:** zod schemas are the single runtime source of truth for input shapes. TypeScript types can be inferred from zod schemas (`z.infer<typeof createSessionInputSchema>`) to eliminate manual type duplication in future phases.
- **DIP:** Repository tests use a D1 interface stub, not a real D1 binding. The `QueryableD1` type (`Pick<D1Database, "prepare">`) already enables this.

---

## Implementation Steps

1. `npm install -D vitest @vitest/coverage-v8 @vitest/ui` and `npm install zod`
2. Create `vitest.config.ts`
3. Update `package.json` scripts (add `typecheck`, fix `lint`, add `test`, `test:watch`, `test:e2e`)
4. Update `eslint.config.mjs` to work with ESLint CLI directly
5. Create `src/lib/validators.ts` with zod schemas
6. Create `src/lib/agentdeck-state.test.ts`
7. Create `src/lib/agentdeck-policy.test.ts`
8. Create `src/lib/agentdeck-db.test.ts` (with D1 stub)
9. Create `src/types/agentdeck-events.test.ts` (event envelope shape validation)
10. Create `.dev.vars.example`
11. Remove dead `useAgentDeckMock()` hook
12. Run `npm run typecheck && npm run lint && npm run test && npm run build` — all must pass
13. Update `AGENTS.md` to reflect working `lint` and `test` scripts

---

## Testing Strategy

| Level | What | Tool |
|---|---|---|
| Unit | State machine transitions (all legal + illegal paths) | vitest |
| Unit | Policy classifier (all 4 risk tiers + unknown default) | vitest |
| Unit | Privacy storage matrix (all 3 modes) | vitest |
| Unit | D1 repositories (CRUD against in-memory stub) | vitest |
| Unit | zod validators (valid + invalid inputs) | vitest |
| Unit | Event envelope shape (all 13 categories) | vitest |

**Coverage target:** >90% for `src/lib/` and `src/types/`.

---

## Acceptance Criteria

```text
[x] npm run typecheck passes with zero errors
[x] npm run lint passes with zero errors
[x] npm run test passes with >90% coverage on src/lib/ and src/types/
[x] npm run build passes (unchanged)
[x] zod schemas exist for all D1 input contracts
[x] .dev.vars.example exists in the workspace
[x] Dead useAgentDeckMock() hook removed
[x] AGENTS.md updated with working lint/test commands
[x] All tests run in <5 seconds
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| D1 stub is incomplete and hides real D1 behavior | Keep stub minimal; add integration tests against real D1 in Phase 02 |
| zod schemas drift from TypeScript types | Infer types from zod schemas where possible (`z.infer`); add a test that asserts schema shape matches the TS type |
| ESLint config breaks after Next 16 migration | Test against `next/core-web-vitals` preset; pin eslint version |
