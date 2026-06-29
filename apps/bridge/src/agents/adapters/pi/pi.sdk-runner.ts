import type { EventSink, HarnessSessionContext } from "@agentdeck/harness";

import { PiProcessRunner } from "./pi.process-runner.js";

export class PiSdkRunner extends PiProcessRunner {
	constructor(ctx: HarnessSessionContext, sink: EventSink) {
		super(ctx, sink, {
			args: (task) => [
				"--mode",
				"sdk",
				...(task.provider ? ["--provider", task.provider] : []),
				...(task.model ? ["--model", task.model] : []),
			],
			harnessMode: "sdk",
			sendInitialTaskAsJson: true,
		});
	}
}
