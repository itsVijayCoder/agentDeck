import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@openfusion/core", "@openfusion/db", "@openfusion/policy"],
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
