import type { AgentKind } from "@agentdeck/core";

import type { HarnessAdapter } from "./types.js";

export class AdapterRegistry {
	private readonly adapters = new Map<AgentKind, HarnessAdapter>();

	get(kind: AgentKind): HarnessAdapter | undefined {
		return this.adapters.get(kind);
	}

	list(): HarnessAdapter[] {
		return [...this.adapters.values()];
	}

	register(adapter: HarnessAdapter): void {
		const existing = this.adapters.get(adapter.kind);
		if (existing && existing.id !== adapter.id) {
			throw new Error(`Adapter kind ${adapter.kind} is already registered by ${existing.id}.`);
		}

		this.adapters.set(adapter.kind, adapter);
	}

	require(kind: AgentKind): HarnessAdapter {
		const adapter = this.get(kind);
		if (!adapter) {
			throw new Error(`No adapter registered for ${kind}.`);
		}

		return adapter;
	}
}
