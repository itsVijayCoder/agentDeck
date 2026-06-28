import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/*.test.tsx", "src/**/*.spec.tsx"],
		passWithNoTests: true,
	},
});
