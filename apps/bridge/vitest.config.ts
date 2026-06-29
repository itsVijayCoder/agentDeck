import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.spec.ts",
				"src/main.ts",
				"src/index.ts",
				"src/auth/token-store.ts",
				"src/pty/pty-manager.ts",
				"src/repo/diff.ts",
				"src/repo/git.ts",
				"src/stream/websocket-client.ts",
			],
			include: ["src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "lcov"],
			thresholds: {
				branches: 80,
				functions: 80,
				lines: 80,
				statements: 80,
			},
		},
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
	},
});
