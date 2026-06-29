import type { AgentDeckQueueMessage } from "./src/lib/phase-08-contracts";
import { consumeQueue } from "./src/workers/queue-consumer";
import { runScheduler } from "./src/workers/scheduler";

export { SessionHub } from "./src/do/session-hub";
export { RunWorkflow } from "./src/workers/run-workflow";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- OpenNext generates this module during `opennextjs-cloudflare build`.
// @ts-ignore OpenNext's generated Worker exists only after the Cloudflare build step.
import worker from "./.open-next/worker.js";

const openNextWorker = worker as ExportedHandler<CloudflareEnv, AgentDeckQueueMessage>;

export default {
	...openNextWorker,
	async queue(batch, env, ctx) {
		void ctx;
		await consumeQueue(batch, env);
	},
	async scheduled(controller, env, ctx) {
		void ctx;
		await runScheduler(env, new Date(controller.scheduledTime));
	},
} satisfies ExportedHandler<CloudflareEnv, AgentDeckQueueMessage>;
