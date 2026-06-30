import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	cacheComponents: true,
	transpilePackages: ["@agentdeck/ai", "@agentdeck/bridge-protocol", "@agentdeck/core", "@agentdeck/db", "@agentdeck/policy"],
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
