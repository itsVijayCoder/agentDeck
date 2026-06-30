import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	cacheComponents: true,
	env: {
		NEXT_PUBLIC_AGENTDECK_DATA_MODE: process.env.AGENTDECK_DATA_MODE ?? process.env.NEXT_PUBLIC_AGENTDECK_DATA_MODE ?? "live",
	},
	transpilePackages: [
		"@agentdeck/ai",
		"@agentdeck/bridge-protocol",
		"@agentdeck/config",
		"@agentdeck/core",
		"@agentdeck/db",
		"@agentdeck/harness",
		"@agentdeck/policy",
		"@agentdeck/ui",
		"@agentdeck/verifier",
	],
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
