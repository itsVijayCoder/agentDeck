import type { EventSink, HarnessSessionContext } from "@agentdeck/harness";

import { PiProcessRunner } from "./pi.process-runner.js";

export class PiJsonRunner extends PiProcessRunner {
	constructor(ctx: HarnessSessionContext, sink: EventSink) {
		super(ctx, sink, {
			args: (task) => [
				"--mode",
				"json",
				...(task.provider ? ["--provider", task.provider] : []),
				...(task.model ? ["--model", task.model] : []),
				task.prompt,
			],
			harnessMode: "json",
		});
	}
}
