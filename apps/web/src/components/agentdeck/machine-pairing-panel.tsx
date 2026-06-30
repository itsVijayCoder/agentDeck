"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, RefreshCw, Terminal } from "lucide-react";
import { AgentDeckApiError, useCreatePairingCode, useMachines } from "@/lib/agentdeck-queries";

export function MachinePairingPanel() {
	const createPairingCode = useCreatePairingCode();
	const machines = useMachines();
	const [copied, setCopied] = useState(false);
	const code = createPairingCode.data?.pairingCode;
	const command = useMemo(
		() =>
			code
				? `pnpm --filter @agentdeck/bridge dev -- pair "${code}" --cloud-url http://localhost:3000 --display-name "My Mac"`
				: "",
		[code],
	);
	const error = createPairingCode.error
		? createPairingCode.error instanceof AgentDeckApiError
			? createPairingCode.error.message
			: "Pairing code request failed."
		: null;

	useEffect(() => {
		if (!code) {
			return;
		}
		const interval = setInterval(() => {
			void machines.refetch();
		}, 2500);
		return () => clearInterval(interval);
	}, [code, machines]);

	return (
		<section className="of-panel">
			<div className="of-panel-heading">
				<div>
					<h2>Pair bridge</h2>
					<p>Generate a short-lived command for the local AgentDeck bridge.</p>
				</div>
				<button
					className="of-secondary-action"
					disabled={createPairingCode.isPending}
					onClick={() => createPairingCode.mutate()}
					type="button"
				>
					<Link2 aria-hidden="true" size={15} />
					{createPairingCode.isPending ? "Generating..." : "Pair Bridge"}
				</button>
			</div>
			{error ? <div className="of-form-error">{error}</div> : null}
			{command ? (
				<div className="of-command-copy">
					<Terminal aria-hidden="true" size={16} />
					<code>{command}</code>
					<button
						aria-label="Copy bridge pairing command"
						className="of-icon-button"
						type="button"
						onClick={() => {
							void navigator.clipboard?.writeText(command);
							setCopied(true);
						}}
					>
						<Copy aria-hidden="true" size={15} />
					</button>
					<span>{copied ? "Copied" : `${createPairingCode.data?.expiresInSeconds ?? 600}s`}</span>
				</div>
			) : (
				<div className="of-empty-state">No active pairing code.</div>
			)}
			<div className="of-machine-list">
				<div className="of-panel-heading compact">
					<div>
						<h2>Machines</h2>
						<p>{machines.data?.length ?? 0} paired</p>
					</div>
					<button className="of-icon-button" onClick={() => void machines.refetch()} type="button" aria-label="Refresh machines">
						<RefreshCw aria-hidden="true" size={15} />
					</button>
				</div>
				{machines.data?.length ? (
					machines.data.map((machine) => (
						<article className={`of-machine-row is-${machine.status}`} key={machine.id}>
							<div>
								<strong>{machine.display_name}</strong>
								<span>
									{machine.os} / {machine.arch} / {machine.bridge_version}
								</span>
							</div>
							<em>{machine.status}</em>
							<div className="of-chip-row">
								{machine.agents.length ? machine.agents.map((agent) => <span key={agent.id}>{agent.agent_kind}</span>) : <span>No agents</span>}
							</div>
						</article>
					))
				) : (
					<div className="of-empty-state">No bridge machines paired.</div>
				)}
			</div>
		</section>
	);
}
