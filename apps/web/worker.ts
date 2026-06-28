export { SessionHub } from "./src/do/session-hub";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- OpenNext generates this module during `opennextjs-cloudflare build`.
// @ts-ignore OpenNext's generated Worker exists only after the Cloudflare build step.
import worker from "./.open-next/worker.js";

export default worker;
