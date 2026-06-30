import { create } from "zustand";
import type { TerminalLeaseMode } from "@agentdeck/core";

type DiffDrawerState = {
	content: string | null;
	open: boolean;
	title: string;
};

type UiState = {
	activeTerminalTabId: string | null;
	commandPaletteOpen: boolean;
	diffDrawer: DiffDrawerState;
	selectedGraphNodeId: string | null;
	selectedRunId: string | null;
	selectedSessionId: string | null;
	terminalLeaseMode: Record<string, TerminalLeaseMode>;
	setActiveTerminalTab: (tabId: string | null) => void;
	setCommandPaletteOpen: (open: boolean) => void;
	setDiffDrawer: (open: boolean, content?: string | null, title?: string) => void;
	setSelectedGraphNode: (nodeId: string | null) => void;
	setSelectedRun: (runId: string | null) => void;
	setSelectedSession: (sessionId: string | null) => void;
	setTerminalLeaseMode: (runId: string, mode: TerminalLeaseMode) => void;
};

export const useUiStore = create<UiState>((set) => ({
	activeTerminalTabId: null,
	commandPaletteOpen: false,
	diffDrawer: {
		content: null,
		open: false,
		title: "Patch preview",
	},
	selectedGraphNodeId: "claude",
	selectedRunId: null,
	selectedSessionId: null,
	terminalLeaseMode: {},
	setActiveTerminalTab: (tabId) => set({ activeTerminalTabId: tabId }),
	setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
	setDiffDrawer: (open, content = null, title = "Patch preview") =>
		set({
			diffDrawer: {
				content,
				open,
				title,
			},
		}),
	setSelectedGraphNode: (nodeId) => set({ selectedGraphNodeId: nodeId }),
	setSelectedRun: (runId) => set({ selectedRunId: runId }),
	setSelectedSession: (sessionId) => set({ selectedSessionId: sessionId }),
	setTerminalLeaseMode: (runId, mode) =>
		set((state) => ({
			terminalLeaseMode: {
				...state.terminalLeaseMode,
				[runId]: mode,
			},
		})),
}));
