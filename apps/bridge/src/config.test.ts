import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getAgentDeckHome, getConfigPath, getStatePath, loadConfig, saveConfig } from "./config.js";
import type { BridgeConfig } from "./types.js";

const config: BridgeConfig = {
	cloudUrl: "http://localhost:3000",
	displayName: "test-machine",
	machineId: "machine-1",
	pairedAt: "2026-06-29T00:00:00.000Z",
	privacyMode: "metadata-only",
	token: "token-1",
	workspaceId: "workspace-1",
};

describe("bridge config", () => {
	it("saves and loads config from an explicit path", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-config-"));
		const path = join(dir, "config.json");

		await saveConfig(config, path);

		await expect(loadConfig(path)).resolves.toEqual(config);
	});

	it("reports invalid JSON clearly", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-config-"));
		const path = join(dir, "config.json");
		await import("node:fs/promises").then((fs) => fs.writeFile(path, "{", "utf8"));

		await expect(loadConfig(path)).rejects.toThrow("not valid JSON");
	});

	it("reports missing config as an unpaired bridge", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-config-"));

		await expect(loadConfig(join(dir, "missing.json"))).rejects.toThrow("not paired");
	});

	it("applies the metadata-only privacy default when reading older config", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-config-"));
		const path = join(dir, "config.json");
		await import("node:fs/promises").then((fs) =>
			fs.writeFile(
				path,
				JSON.stringify({
					cloudUrl: "http://localhost:3000",
					displayName: "test-machine",
					machineId: "machine-1",
					pairedAt: "2026-06-29T00:00:00.000Z",
					token: "token-1",
					workspaceId: "workspace-1",
				}),
				"utf8",
			),
		);

		await expect(loadConfig(path)).resolves.toMatchObject({ privacyMode: "metadata-only" });
	});

	it("refuses to save invalid config", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-config-"));

		await expect(saveConfig({ ...config, cloudUrl: "not-a-url" }, join(dir, "config.json"))).rejects.toThrow("Cannot save");
	});

	it("loads config path helper values from environment", () => {
		const originalHome = process.env.AGENTDECK_HOME;
		const originalPath = process.env.AGENTDECK_CONFIG_PATH;
		const originalStatePath = process.env.AGENTDECK_STATE_PATH;
		process.env.AGENTDECK_HOME = "/tmp/agentdeck-home";
		process.env.AGENTDECK_CONFIG_PATH = "/tmp/agentdeck-config.json";
		process.env.AGENTDECK_STATE_PATH = "/tmp/agentdeck-state.jsonl";

		try {
			expect(getAgentDeckHome()).toBe("/tmp/agentdeck-home");
			expect(getConfigPath()).toBe("/tmp/agentdeck-config.json");
			expect(getConfigPath("/explicit/config.json")).toBe("/explicit/config.json");
			expect(getStatePath()).toBe("/tmp/agentdeck-state.jsonl");
			expect(getStatePath("/explicit/state.jsonl")).toBe("/explicit/state.jsonl");
		} finally {
			if (originalHome === undefined) {
				delete process.env.AGENTDECK_HOME;
			} else {
				process.env.AGENTDECK_HOME = originalHome;
			}
			if (originalPath === undefined) {
				delete process.env.AGENTDECK_CONFIG_PATH;
			} else {
				process.env.AGENTDECK_CONFIG_PATH = originalPath;
			}
			if (originalStatePath === undefined) {
				delete process.env.AGENTDECK_STATE_PATH;
			} else {
				process.env.AGENTDECK_STATE_PATH = originalStatePath;
			}
		}
	});

	it("reports schema validation errors while loading config", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-config-"));
		const path = join(dir, "config.json");
		await import("node:fs/promises").then((fs) => fs.writeFile(path, JSON.stringify({ ...config, token: "" }), "utf8"));

		await expect(loadConfig(path)).rejects.toThrow("config is invalid");
	});
});
