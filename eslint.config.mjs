import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
	...nextCoreWebVitals,
	...nextTypescript,
	{
		files: ["**/*.test.ts", "**/*.spec.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		ignores: [
			".next/**",
			".open-next/**",
			".wrangler/**",
			"cloudflare-env.d.ts",
			"coverage/**",
			"node_modules/**",
			"test-results/**",
		],
	},
];

export default eslintConfig;
