const configPackageLint = [
	{
		files: ["**/*.mjs"],
		languageOptions: {
			sourceType: "module",
		},
	},
	{
		ignores: ["node_modules/**"],
	},
];

export default configPackageLint;
