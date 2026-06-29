import type { EventSink, HarnessSessionContext } from "@agentdeck/harness";

import { PiProcessRunner } from "./pi.process-runner.js";

export class PiRpcRunner extends PiProcessRunner {
	constructor(ctx: HarnessSessionContext, sink: EventSink) {
		super(ctx, sink, {
			args: (task) => [
				"--mode",
				"rpc",
				...(task.provider ? ["--provider", task.provider] : []),
				...(task.model ? ["--model", task.model] : []),
			],
			harnessMode: "rpc",
			sendInitialTaskAsJson: true,
		});
	}
}
