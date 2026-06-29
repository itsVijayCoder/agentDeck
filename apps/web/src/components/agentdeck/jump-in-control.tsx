"use client";

import { useCallback } from "react";
import { transitionTerminalLease, type BrowserControlMessage } from "@agentdeck/core";

import type { TerminalLeaseState } from "./terminal-lease";

export function JumpInControl({
	leaseState,
	onControl,
	runId,
}: {
	leaseState: TerminalLeaseState;
	onControl: (message: BrowserControlMessage) => boolean;
	runId: string;
}) {
	const requestHumanControl = useCallback(() => {
		const transition = transitionTerminalLease(leaseState.mode, "human-control");
		if (!transition.ok) {
			return;
		}

		onControl({
			mode: "human-control",
			runId,
			type: "terminal.lease.request",
		});
	}, [leaseState.mode, onControl, runId]);

	const releaseControl = useCallback(() => {
		const transition = transitionTerminalLease(leaseState.mode, "agent-control");
		if (!transition.ok || !leaseState.leaseId) {
			return;
		}

		onControl({
			leaseId: leaseState.leaseId,
			runId,
			type: "terminal.lease.release",
		});
	}, [leaseState.leaseId, leaseState.mode, onControl, runId]);

	if (leaseState.mode === "read-only") {
		return (
			<button className="of-terminal-control" disabled type="button">
				Read Only
			</button>
		);
	}

	if (leaseState.mode === "human-control") {
		return (
			<button
				className="of-terminal-control is-active"
				disabled={!leaseState.leaseId}
				type="button"
				onClick={releaseControl}
			>
				Release
			</button>
		);
	}

	return (
		<button className="of-terminal-control is-primary" type="button" onClick={requestHumanControl}>
			Jump In
		</button>
	);
}
