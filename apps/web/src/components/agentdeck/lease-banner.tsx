"use client";

import type { TerminalLeaseMode } from "@agentdeck/core";

const leaseBannerCopy: Record<TerminalLeaseMode, { detail: string; title: string }> = {
	"agent-control": {
		detail: "Agent keystrokes are active. Jump in to take audited live control.",
		title: "Agent has control",
	},
	"human-control": {
		detail: "Your keyboard input is sent to the PTY and recorded as audit events.",
		title: "You are controlling",
	},
	"read-only": {
		detail: "Terminal output is live, but input is blocked for this observer.",
		title: "Read-only observer",
	},
};

export function LeaseBanner({
	connected,
	mode,
}: {
	connected: boolean;
	mode: TerminalLeaseMode;
}) {
	const copy = leaseBannerCopy[mode];

	return (
		<div className={`of-lease-banner is-${mode}`} role="status">
			<span>{copy.title}</span>
			<small>{copy.detail}</small>
			<em>{connected ? "Bridge channel ready" : "Preview mode"}</em>
		</div>
	);
}
