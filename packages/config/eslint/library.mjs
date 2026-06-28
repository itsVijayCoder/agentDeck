import nextTypescript from "eslint-config-next/typescript";

const libraryConfig = [
	...nextTypescript,
	{
		files: ["**/*.test.ts", "**/*.spec.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		ignores: ["coverage/**", "dist/**", "node_modules/**"],
	},
];

export default libraryConfig;
