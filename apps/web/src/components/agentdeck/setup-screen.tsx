"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap, LockKeyhole, ShieldCheck } from "lucide-react";
import { AgentDeckApiError, useCreateWorkspace, type SetupWorkspaceInput } from "@/lib/agentdeck-queries";

export function SetupScreen({ initialError }: { initialError?: string }) {
	const router = useRouter();
	const createWorkspace = useCreateWorkspace();
	const [form, setForm] = useState<SetupWorkspaceInput>({
		defaultBranch: "main",
		name: "Local workspace",
		privacyMode: "metadata-only",
		repositoryUrl: "",
	});

	const error = createWorkspace.error
		? createWorkspace.error instanceof AgentDeckApiError
			? createWorkspace.error.message
			: "Workspace setup failed."
		: initialError;

	return (
		<main className="of-setup-shell">
			<section className="of-setup-panel">
				<div className="of-page-title-icon">
					<DatabaseZap aria-hidden="true" size={22} />
				</div>
				<div>
					<h1>Set up AgentDeck</h1>
					<p>Create a local workspace before starting real bridge-backed agent runs.</p>
				</div>
				<form
					className="of-form-grid"
					onSubmit={(event) => {
						event.preventDefault();
						createWorkspace.mutate(
							{
								...form,
								repositoryUrl: form.repositoryUrl?.trim() ? form.repositoryUrl.trim() : null,
							},
							{
								onSuccess: () => {
									router.push("/mission-control");
									router.refresh();
								},
							},
						);
					}}
				>
					<label>
						<span>Workspace name</span>
						<input
							required
							value={form.name}
							onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
						/>
					</label>
					<label>
						<span>Repository path or URL</span>
						<input
							placeholder="/Users/me/project"
							value={form.repositoryUrl ?? ""}
							onChange={(event) => setForm((current) => ({ ...current, repositoryUrl: event.target.value }))}
						/>
					</label>
					<label>
						<span>Default branch</span>
						<input
							required
							value={form.defaultBranch ?? "main"}
							onChange={(event) => setForm((current) => ({ ...current, defaultBranch: event.target.value }))}
						/>
					</label>
					<label>
						<span>Privacy mode</span>
						<select
							value={form.privacyMode}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									privacyMode: event.target.value as SetupWorkspaceInput["privacyMode"],
								}))
							}
						>
							<option value="local-only">Local only</option>
							<option value="metadata-only">Metadata only</option>
							<option value="full-sync">Full sync</option>
						</select>
					</label>
					{error ? <div className="of-form-error">{error}</div> : null}
					<button className="of-primary-action" disabled={createWorkspace.isPending} type="submit">
						{createWorkspace.isPending ? "Creating..." : "Create workspace"}
					</button>
				</form>
				<div className="of-route-band compact">
					<div>
						<LockKeyhole aria-hidden="true" size={16} />
						<strong>Session cookie</strong>
						<span>`AGENTDECK_SESSION_SECRET` must be set for live mode.</span>
					</div>
					<div>
						<ShieldCheck aria-hidden="true" size={16} />
						<strong>D1 required</strong>
						<span>Run migrations before using live control-plane data.</span>
					</div>
				</div>
			</section>
		</main>
	);
}
