import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		coverage: {
			exclude: ["src/**/*.test.ts", "src/lib/mock-openfusion.ts"],
			include: ["src/lib/**/*.ts", "src/types/**/*.ts"],
			provider: "v8",
			reporter: ["text", "lcov"],
			thresholds: {
				branches: 90,
				functions: 90,
				lines: 90,
				statements: 90,
			},
		},
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
	},
});
