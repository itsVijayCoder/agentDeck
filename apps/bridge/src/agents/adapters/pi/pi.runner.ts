import type { ApprovalDecision, HarnessTask, TerminalInput, UserSteeringMessage } from "@agentdeck/harness";

export interface PiRunner {
	approve(requestId: string, decision: ApprovalDecision): Promise<void>;
	cancel(reason: string): Promise<void>;
	dispose(): Promise<void>;
	pause(): Promise<void>;
	resume(): Promise<void>;
	sendTerminalInput(input: TerminalInput): Promise<void>;
	sendUserMessage(message: UserSteeringMessage): Promise<void>;
	start(task: HarnessTask): Promise<void>;
}
