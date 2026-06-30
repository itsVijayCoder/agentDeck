# Phase 11 — Premium UI System Redesign

**Objective:** Rebuild the Mission Control UI as a premium, multi-screen, professional command center. Migrate from the single-file mock dashboard to a proper multi-route App Router architecture with React Flow, xterm.js, Zustand, TanStack Query, Motion, Lucide icons, and accessible Radix command/dropdown surfaces. Design like a senior product designer: dark obsidian theme, glass panels, subtle glows, information-rich but not cluttered.

**Prerequisites:** Phase 02 (Worker API for data), Phase 03 (SessionHub for realtime events).

---

## Current State

- Implemented on 2026-06-30 as a multi-route App Router shell.
- `/` redirects to `/mission-control`; routes now exist for `/mission-control`, `/sessions/[id]`, `/agents`, `/queue`, `/schedules`, `/reports`, `/reports/[id]`, `/policies`, and `/settings/machines`.
- `apps/web/src/components/agentdeck/app-shell.tsx` owns the persistent top command bar, left navigation, right inspector, command palette, diff drawer, and terminal dock.
- `apps/web/src/components/agentdeck/mission-control-screen.tsx` owns the active run cockpit and React Flow orchestration graph.
- `apps/web/src/components/agentdeck/route-screens.tsx` owns the remaining route screens.
- `apps/web/src/store/ui-store.ts` owns UI-only state with Zustand.
- `apps/web/src/lib/query-provider.tsx` and `apps/web/src/lib/agentdeck-queries.ts` add TanStack Query first-party API warmup with deterministic mock fallback.
- `apps/web/next.config.ts` enables `cacheComponents: true`; static routes prerender and dynamic session/report detail routes partially prerender.
- Custom `of-*` CSS classes remain the active styling system per `AGENTS.md`. The original shadcn/Tailwind utility migration target is intentionally deferred/superseded.

---

## Target State

```text
- 8+ routes: /mission-control, /sessions/[id], /agents, /queue, /schedules, /reports, /reports/[id], /policies, /settings/machines
- Radix primitives for accessible command/dropdown surfaces without replacing the `of-*` design system
- Tailwind CSS v4 remains imported for theme compatibility, but custom `of-*` classes stay authoritative
- React Flow for interactive agent orchestration graph
- xterm.js for real terminal rendering (Phase 05)
- Zustand for client UI state (selected session, terminal tab, command palette)
- TanStack Query for server state (sessions, agents, queue, schedules, reports)
- Motion for subtle, state-driven animations
- Lucide React for consistent icons
- Dark obsidian theme with CSS variables preserved
- Responsive: 1240px (collapse nav), 860px (stack)
- Keyboard-accessible command palette (Cmd+K)
- Reduced-motion support
- Next.js 16 Cache Components/PPR enabled where compatible
```

---

## High-Level Design

### Layout architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ TopCommandBar: workspace | repo | ask box | machines | cost | approvals    │
├───────────┬──────────────────────────────────────────┬────────────────────┤
│ LeftNav   │ Center: MissionCanvas / Route content    │ RightInspector      │
│ Mission   │   ActiveRunHero                          │   DecisionReport    │
│ Sessions  │   AgentGraph (React Flow)                │   Confidence        │
│ Agents    │   RunTimeline                            │   VerificationStack │
│ Queue     │   CandidateComparison                    │   ApprovalQueue     │
│ Schedules │                                          │   RiskFlags         │
│ Reports   │                                          │   CostMeter         │
│ Policies  │                                          │                    │
├───────────┴──────────────────────────────────────────┴────────────────────┤
│ TerminalDock: Claude | Codex | OpenCode | Qwen | Pi | Tests | System      │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component tree

```text
AppShell
├── TopCommandBar
│   ├── WorkspaceSelector
│   ├── RepoSelector
│   ├── GlobalTaskInput
│   ├── MachineStatusIndicator
│   ├── CostMeter
│   ├── ApprovalBadge
│   └── UserAvatar
├── LeftNavigation
│   └── NavItem (x8)
├── MainContent (route outlet)
│   ├── MissionControlPage
│   │   ├── ActiveRunHero
│   │   ├── AgentGraph (React Flow)
│   │   │   ├── TaskNode
│   │   │   ├── RouterNode
│   │   │   ├── AgentNode
│   │   │   ├── VerifierNode
│   │   │   ├── JudgeNode
│   │   │   └── HumanReviewNode
│   │   ├── RunTimeline
│   │   └── CandidateComparisonTable
│   ├── SessionDetailPage
│   │   ├── SessionTimeline
│   │   ├── MessageTree
│   │   ├── TerminalReplay
│   │   └── ArtifactList
│   ├── AgentInventoryPage
│   │   └── AgentCard (x7)
│   ├── BuildQueuePage
│   │   ├── QueueColumn (x6: queued, waiting, running, approval, completed, failed)
│   │   └── QueuePolicyPanel
│   ├── SchedulesPage
│   │   ├── ScheduleCalendar
│   │   └── ScheduleEditor
│   ├── ReportsPage
│   │   ├── ReportList
│   │   └── ReportDetail
│   ├── PoliciesPage
│   │   ├── PrivacyModeSelector
│   │   ├── CommandApprovalMatrix
│   │   ├── ProviderAllowlist
│   │   └── ProtectedPaths
│   └── MachineSettingsPage
│       └── EmptyMachinePairingState
├── RightInspector
│   ├── DecisionReportPanel
│   ├── ConfidenceMeter
│   ├── VerificationStack
│   ├── ApprovalQueue
│   └── RiskFlags
├── TerminalDock
│   ├── TerminalTab (x N)
│   └── TerminalPane (xterm.js)
├── CommandPalette (Cmd+K overlay)
└── DiffDrawer (slide-in)
```

---

## Low-Level Design

### 1. Install dependencies

```bash
cd apps/web && pnpm add @tanstack/react-query zustand @xyflow/react \
  @xterm/xterm @xterm/addon-fit lucide-react motion \
  class-variance-authority clsx tailwind-merge \
  @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-tooltip @radix-ui/react-tabs \
  @radix-ui/react-select @radix-ui/react-switch
```

### 2. Design tokens (preserve existing CSS variables)

**`apps/web/src/app/globals.css`** — keep the `:root` variables, add Tailwind theme mapping:

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-panel: var(--panel);
  --color-border: var(--border);
  --color-cyan: var(--cyan);
  --color-violet: var(--violet);
  --color-amber: var(--amber);
  --color-green: var(--green);
  --color-red: var(--red);
  --color-muted: var(--muted);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

:root {
  --background: #0a0e14;
  --foreground: #e6edf3;
  --panel: #11161d;
  --panel-elevated: #161c24;
  --border: #1e252e;
  --border-hover: #2d3744;
  --muted: #6b7785;
  --cyan: #22d3ee;
  --violet: #a78bfa;
  --amber: #fbbf24;
  --green: #34d399;
  --red: #f87171;
  --radius: 8px;
  --radius-sm: 6px;
  --radius-lg: 12px;
}

* {
  border-color: var(--border);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Glass panel effect */
.glass-panel {
  background: color-mix(in srgb, var(--panel) 80%, transparent);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

/* Subtle glow for active elements */
.glow-cyan { box-shadow: 0 0 20px -5px color-mix(in srgb, var(--cyan) 40%, transparent); }
.glow-violet { box-shadow: 0 0 20px -5px color-mix(in srgb, var(--violet) 40%, transparent); }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-hover); }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 3. Radix primitives and utility compatibility

Phase 11 uses Radix primitives directly for accessible command palette, dropdown, and tooltip behavior while preserving the repository's `of-*` styling contract. A `cn()` utility is still available for future component composition and package compatibility, but dashboard layout classes remain custom CSS in `apps/web/src/app/globals.css`.

**`apps/web/src/lib/utils.ts`:**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 4. Zustand store

**`apps/web/src/store/ui-store.ts`:**

```ts
import { create } from "zustand";

type UiState = {
  selectedSessionId: string | null;
  selectedRunId: string | null;
  selectedGraphNodeId: string | null;
  activeTerminalTabId: string | null;
  commandPaletteOpen: boolean;
  diffDrawerOpen: boolean;
  diffContent: string | null;
  terminalLeaseMode: Record<string, "agent-control" | "human-control" | "read-only">;

  setSelectedSession: (id: string | null) => void;
  setSelectedRun: (id: string | null) => void;
  setSelectedGraphNode: (id: string | null) => void;
  setActiveTerminalTab: (id: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setDiffDrawer: (open: boolean, content?: string) => void;
  setTerminalLeaseMode: (runId: string, mode: "agent-control" | "human-control" | "read-only") => void;
};

export const useUiStore = create<UiState>((set) => ({
  selectedSessionId: null,
  selectedRunId: null,
  selectedGraphNodeId: null,
  activeTerminalTabId: null,
  commandPaletteOpen: false,
  diffDrawerOpen: false,
  diffContent: null,
  terminalLeaseMode: {},

  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setSelectedRun: (id) => set({ selectedRunId: id }),
  setSelectedGraphNode: (id) => set({ selectedGraphNodeId: id }),
  setActiveTerminalTab: (id) => set({ activeTerminalTabId: id }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setDiffDrawer: (open, content) => set({ diffDrawerOpen: open, diffContent: content ?? null }),
  setTerminalLeaseMode: (runId, mode) =>
    set((state) => ({ terminalLeaseMode: { ...state.terminalLeaseMode, [runId]: mode } })),
}));
```

### 5. TanStack Query setup

**`apps/web/src/lib/query-provider.tsx`:**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

**`apps/web/src/lib/queries.ts`** — query hooks:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const res = await fetch("/api/sessions");
      return res.json();
    },
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ["sessions", id],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${id}`);
      return res.json();
    },
    enabled: !!id,
  });
}

export function useApprovals() {
  return useQuery({
    queryKey: ["approvals"],
    queryFn: async () => {
      const res = await fetch("/api/approvals");
      return res.json();
    },
    refetchInterval: 10_000,
  });
}

export function useQueue() {
  return useQuery({
    queryKey: ["queue"],
    queryFn: async () => {
      const res = await fetch("/api/queue");
      return res.json();
    },
  });
}

export function useSchedules() {
  return useQuery({
    queryKey: ["schedules"],
    queryFn: async () => {
      const res = await fetch("/api/schedules");
      return res.json();
    },
  });
}

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const res = await fetch("/api/reports");
      return res.json();
    },
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await fetch("/api/machines");
      return res.json();
    },
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approved" | "rejected" }) => {
      const res = await fetch(`/api/approvals/${id}/${decision}`, { method: "POST" });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}
```

### 6. App Router routes

```text
apps/web/src/app/
  layout.tsx                    # Root layout with QueryProvider + AppShell
  page.tsx                      # Redirect to /mission-control
  mission-control/
    page.tsx                    # Active run cockpit
  sessions/
    [id]/
      page.tsx                  # Session detail
  agents/
    page.tsx                    # Agent inventory
  queue/
    page.tsx                    # Build queue board
  schedules/
    page.tsx                    # Scheduled jobs
  reports/
    page.tsx                    # Decision reports list
    [id]/
      page.tsx                  # Report detail
  policies/
    page.tsx                    # Policy matrix
  settings/
    machines/
      page.tsx                  # Machine pairing
```

### 7. AppShell layout

**`apps/web/src/components/agentdeck/app-shell.tsx`:**

```tsx
"use client";

import { TopCommandBar } from "./top-command-bar";
import { LeftNavigation } from "./left-navigation";
import { CommandPalette } from "./command-palette";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopCommandBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftNavigation />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
```

### 8. Agent graph with React Flow

**`apps/web/src/components/agentdeck/agent-graph.tsx`:**

```tsx
"use client";

import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import { motion } from "motion/react";
import "@xyflow/react/dist/style.css";

type AgentGraphProps = {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string | null;
};

const nodeColors: Record<string, string> = {
  task: "#6b7785",
  router: "#22d3ee",
  "claude-code": "#f59e0b",
  codex: "#10b981",
  opencode: "#3b82f6",
  qwen: "#8b5cf6",
  pi: "#ec4899",
  verifier: "#34d399",
  judge: "#a78bfa",
  human: "#fbbf24",
};

export function AgentGraph({ nodes, edges, onNodeClick, selectedNodeId }: AgentGraphProps) {
  const styledNodes = nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    style: {
      background: "var(--panel)",
      border: `1px solid ${nodeColors[node.type ?? "task"] ?? "var(--border)"}`,
      borderRadius: "8px",
      padding: "8px 12px",
      fontSize: "12px",
      color: "var(--foreground)",
    },
  }));

  const styledEdges = edges.map((edge) => ({
    ...edge,
    animated: edge.data?.active,
    style: {
      stroke: edge.data?.active ? "var(--cyan)" : "var(--border)",
      strokeWidth: edge.data?.active ? 2 : 1,
    },
  }));

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

### 9. Command palette

**`apps/web/src/components/agentdeck/command-palette.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/store/ui-store";
import { Search, GitBranch, Bot, Calendar, FileText, Shield, Settings, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const COMMANDS = [
  { id: "goto-mission", label: "Go to Mission Control", icon: Terminal, path: "/mission-control" },
  { id: "goto-agents", label: "Go to Agent Inventory", icon: Bot, path: "/agents" },
  { id: "goto-queue", label: "Go to Build Queue", icon: GitBranch, path: "/queue" },
  { id: "goto-schedules", label: "Go to Schedules", icon: Calendar, path: "/schedules" },
  { id: "goto-reports", label: "Go to Reports", icon: FileText, path: "/reports" },
  { id: "goto-policies", label: "Go to Policies", icon: Shield, path: "/policies" },
  { id: "goto-machines", label: "Go to Machine Settings", icon: Settings, path: "/settings/machines" },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUiStore();
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[20vh]"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: -10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -10 }}
            className="glass-panel w-full max-w-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              />
              <kbd className="text-xs text-muted">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-auto p-2">
              {filtered.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    router.push(cmd.path);
                    setCommandPaletteOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-panel-elevated"
                >
                  <cmd.icon className="h-4 w-4 text-muted" />
                  {cmd.label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### 10. Status pills, risk badges, meters

**`apps/web/src/components/agentdeck/primitives.tsx`:**

```tsx
"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";

const statusConfig = {
  running: { color: "text-cyan", bg: "bg-cyan/10", dot: "bg-cyan", pulse: true },
  waiting: { color: "text-amber", bg: "bg-amber/10", dot: "bg-amber", pulse: true },
  passed: { color: "text-green", bg: "bg-green/10", dot: "bg-green", pulse: false },
  failed: { color: "text-red", bg: "bg-red/10", dot: "bg-red", pulse: false },
  idle: { color: "text-muted", bg: "bg-muted/10", dot: "bg-muted", pulse: false },
  cancelled: { color: "text-muted", bg: "bg-muted/10", dot: "bg-muted", pulse: false },
} as const;

export function StatusPill({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", config.color, config.bg)}>
      <span className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", config.dot)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", config.dot)} />
      </span>
      {status}
    </span>
  );
}

const riskConfig = {
  low: { color: "text-green", bg: "bg-green/10", label: "Low" },
  medium: { color: "text-amber", bg: "bg-amber/10", label: "Medium" },
  high: { color: "text-orange-400", bg: "bg-orange-400/10", label: "High" },
  critical: { color: "text-red", bg: "bg-red/10", label: "Critical" },
} as const;

export function RiskBadge({ risk }: { risk: keyof typeof riskConfig }) {
  const config = riskConfig[risk];
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", config.color, config.bg)}>
      {config.label}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const color = value > 0.8 ? "var(--green)" : value > 0.5 ? "var(--amber)" : "var(--red)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <span className="text-xs text-muted">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function CostMeter({ costUsd }: { costUsd: number }) {
  return (
    <span className="text-xs text-muted">
      ${costUsd.toFixed(4)}
    </span>
  );
}
```

### 11. Empty machine pairing state

**`apps/web/src/components/agentdeck/empty-pairing-state.tsx`:**

```tsx
"use client";

import { Terminal, Shield, Lock } from "lucide-react";
import { motion } from "motion/react";

export function EmptyMachinePairingState({ pairingCode }: { pairingCode: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel max-w-md p-8 text-center"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan/10">
          <Terminal className="h-6 w-6 text-cyan" />
        </div>
        <h2 className="mb-2 text-lg font-semibold">Pair your machine</h2>
        <p className="mb-6 text-sm text-muted">
          A local bridge is required to detect and run terminal agents. Run this command on your machine:
        </p>
        <div className="rounded-md border border-border bg-background/50 p-3 text-left">
          <code className="text-xs text-cyan">npx agentdeck-bridge pair {pairingCode}</code>
        </div>
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Local-first</span>
          <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> No auto-merge</span>
        </div>
      </motion.div>
    </div>
  );
}
```

---

## Design Patterns

| Pattern | Application |
|---|---|
| **Container/Presentational** | Query hooks (`useSessions`, `useApprovals`) are containers; components are presentational. |
| **Store** | Zustand store holds UI-only state. TanStack Query holds server state. Clear separation. |
| **Strategy** | Status pill, risk badge, and meter components render differently based on status/risk level. |
| **Observer** | `useSessionWebSocket` hook observes realtime events. Components re-render on new events. |
| **Command** | Command palette items are command objects with `id`, `label`, `icon`, `path`. |
| **Factory** | `cn()` utility is available for composable class merging; route screens share primitive renderers. |

## SOLID / DRY Compliance

- **SRP:** Each component renders one thing. `StatusPill` shows status. `RiskBadge` shows risk. `ConfidenceMeter` shows confidence. `AgentGraph` renders the graph. `CommandPalette` handles search.
- **OCP:** New routes are added as new page files. New graph node types are added as new node configs. No existing component is modified.
- **LSP:** Any `StatusPill` can replace any other. Any `AgentGraphNode` works with React Flow.
- **ISP:** Components accept minimal props. `StatusPill` takes only `status`. `RiskBadge` takes only `risk`.
- **DIP:** Components depend on TanStack Query hooks (abstraction), not on `fetch` directly. UI state depends on Zustand store interface.
- **DRY:** Design tokens are CSS variables (one place). Status/risk config maps are in `primitives.tsx` (one place). Query hooks are in `queries.ts` (one place). UI store is in `ui-store.ts` (one place).

---

## Testing Strategy

| Level | What | Tool |
|---|---|---|
| Unit | StatusPill rendering (all statuses) | vitest + @testing-library/react |
| Unit | RiskBadge rendering (all levels) | vitest |
| Unit | ConfidenceMeter animation | vitest |
| Unit | Command palette filter + navigate | vitest |
| Unit | Zustand store actions | vitest |
| Unit | Query hooks (mock fetch) | vitest |
| Integration | Route navigation (all 8 routes) | vitest + next/navigation mock |
| E2E | Full page load + interaction | Playwright |

---

## Implementation Steps

1. Install all UI dependencies
2. Add `cn()` utility compatibility for future shadcn-style components
3. Add Radix primitives for accessible dialog/dropdown/tooltip surfaces while preserving `of-*` styling
4. Update `globals.css` — preserve CSS variables, add Tailwind theme mapping, React Flow CSS, route/shell styles
5. Create `QueryProvider` and wrap in root layout
6. Create Zustand `useUiStore`
7. Create query hooks with first-party Worker API warmup and mock fallback
8. Create `AppShell`, `TopCommandBar`, `LeftNavigation`
9. Create route pages: `/mission-control`, `/sessions/[id]`, `/agents`, `/queue`, `/schedules`, `/reports`, `/reports/[id]`, `/policies`, `/settings/machines`
10. Create `AgentGraph` with React Flow
11. Create `CommandPalette` with Cmd+K
12. Create primitives: `StatusPill`, `RiskBadge`, `ConfidenceMeter`, `CostMeter`
13. Create `EmptyMachinePairingState`
14. Create `DiffDrawer` (slide-in panel)
15. Wire `TerminalDock` + `TerminalPane` (from Phase 05)
16. Keep visible UI deterministic from mock data and warm Worker API state with TanStack Query fallback
17. Add Motion animations (subtle, state-driven)
18. Add Lucide icons throughout
19. Test responsive breakpoints (1240px, 860px)
20. Test reduced-motion
21. Enable Next.js 16 `cacheComponents` and validate static/PPR build output
22. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

---

## Acceptance Criteria

```text
[x] 8+ routes exist and are navigable
[~] shadcn/Tailwind migration superseded by AGENTS.md; Radix primitives are used for accessible command/dropdown/tooltip surfaces
[~] Tailwind utilities are not used for dashboard layout; custom `of-*` classes remain authoritative
[x] CSS variables preserved in :root
[x] React Flow renders agent graph with styled nodes and animated edges
[x] xterm.js renders in terminal dock (from Phase 05)
[x] Zustand store manages UI state (selected session/run/graph node, terminal tab, palette, diff drawer)
[x] TanStack Query warms first-party Worker API state with mock fallback
[x] Command palette opens with Cmd+K and navigates
[x] Motion animations are subtle and respect reduced-motion
[x] Lucide icons used consistently
[x] RiskBadge, ConfidenceMeter, Metric, candidate rows, and verification cards render consistently
[x] Empty machine pairing state is premium
[x] Responsive at 1240px (nav collapses) and 860px (stacks)
[x] All pages have proper empty states
[x] Dark obsidian theme is consistent
[x] Next.js Cache Components enabled; static routes prerender and detail routes partially prerender
[x] pnpm build passes
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Migration from of-* to Tailwind breaks styles | Superseded by AGENTS.md; keep `of-*` classes as the production dashboard styling contract |
| React Flow performance with many nodes | Limit to 20 nodes; use `nodesDraggable={false}` for static graphs |
| TanStack Query SSR with OpenNext | Use `staleTime` to avoid refetch on hydration; test on Cloudflare |
| Bundle size grows with all libraries | Use dynamic imports for heavy components (React Flow, xterm); tree-shake Lucide |
| Motion causes jank | Use `transform` and `opacity` only; respect `prefers-reduced-motion` |
