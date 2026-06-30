"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Play, X } from "lucide-react";
import { AgentDeckApiError, useCreateTask, type NewTaskInput } from "@/lib/agentdeck-queries";

const agentOptions: Array<{ label: string; value: NewTaskInput["agentKind"] }> = [
	{ label: "Auto route", value: "auto" },
	{ label: "Claude Code", value: "claude-code" },
	{ label: "Codex", value: "codex" },
	{ label: "OpenCode", value: "opencode" },
	{ label: "Qwen Code", value: "qwen-code" },
	{ label: "Pi", value: "pi" },
	{ label: "Aider", value: "aider" },
];

export function NewTaskDialog({
	defaultPrivacyMode,
	defaultRepositoryPath,
	open,
	onOpenChange,
}: {
	defaultPrivacyMode: NewTaskInput["privacyMode"];
	defaultRepositoryPath: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const createTask = useCreateTask();
	const [form, setForm] = useState<NewTaskInput>({
		agentKind: "auto",
		maxCostUsd: 5,
		maxRuntimeMinutes: 30,
		priority: "normal",
		privacyMode: defaultPrivacyMode,
		repositoryPath: defaultRepositoryPath,
		task: "",
		verification: {
			build: false,
			lint: true,
			test: true,
			typecheck: true,
		},
	});
	const validationError = useMemo(() => {
		if (form.task.trim().length < 8) {
			return "Enter a task with enough detail to dispatch.";
		}
		if (!form.repositoryPath.trim()) {
			return "Repository path is required.";
		}
		return null;
	}, [form.repositoryPath, form.task]);
	const submitError = createTask.error
		? createTask.error instanceof AgentDeckApiError
			? createTask.error.message
			: "Task creation failed."
		: null;

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="of-dialog-overlay" />
				<Dialog.Content className="of-dialog">
					<div className="of-panel-heading compact">
						<div>
							<Dialog.Title>New task</Dialog.Title>
							<Dialog.Description>Create a persisted local agent run.</Dialog.Description>
						</div>
						<Dialog.Close asChild>
							<button aria-label="Close new task" className="of-icon-button" type="button">
								<X aria-hidden="true" size={16} />
							</button>
						</Dialog.Close>
					</div>
					<form
						className="of-form-grid"
						onSubmit={(event) => {
							event.preventDefault();
							if (validationError) {
								return;
							}
							createTask.mutate(
								{
									...form,
									maxCostUsd: form.maxCostUsd ?? null,
									maxRuntimeMinutes: form.maxRuntimeMinutes ?? null,
									repositoryPath: form.repositoryPath.trim(),
									task: form.task.trim(),
								},
								{
									onSuccess: ({ session }) => {
										onOpenChange(false);
										router.push(`/sessions/${session.id}`);
									},
								},
							);
						}}
					>
						<label className="of-form-full">
							<span>Task prompt</span>
							<textarea
								autoFocus
								required
								rows={5}
								value={form.task}
								onChange={(event) => setForm((current) => ({ ...current, task: event.target.value }))}
							/>
						</label>
						<label>
							<span>Agent</span>
							<select
								value={form.agentKind}
								onChange={(event) =>
									setForm((current) => ({ ...current, agentKind: event.target.value as NewTaskInput["agentKind"] }))
								}
							>
								{agentOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
						<label>
							<span>Priority</span>
							<select
								value={form.priority}
								onChange={(event) =>
									setForm((current) => ({ ...current, priority: event.target.value as NewTaskInput["priority"] }))
								}
							>
								<option value="low">Low</option>
								<option value="normal">Normal</option>
								<option value="high">High</option>
								<option value="urgent">Urgent</option>
							</select>
						</label>
						<label className="of-form-full">
							<span>Repository path</span>
							<input
								required
								value={form.repositoryPath}
								onChange={(event) => setForm((current) => ({ ...current, repositoryPath: event.target.value }))}
							/>
						</label>
						<label>
							<span>Privacy mode</span>
							<select
								value={form.privacyMode}
								onChange={(event) =>
									setForm((current) => ({ ...current, privacyMode: event.target.value as NewTaskInput["privacyMode"] }))
								}
							>
								<option value="local-only">Local only</option>
								<option value="metadata-only">Metadata only</option>
								<option value="full-sync">Full sync</option>
							</select>
						</label>
						<label>
							<span>Max runtime</span>
							<input
								min={1}
								type="number"
								value={form.maxRuntimeMinutes ?? ""}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										maxRuntimeMinutes: event.target.value ? Number(event.target.value) : null,
									}))
								}
							/>
						</label>
						<label>
							<span>Max cost USD</span>
							<input
								min={0}
								step="0.25"
								type="number"
								value={form.maxCostUsd ?? ""}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										maxCostUsd: event.target.value ? Number(event.target.value) : null,
									}))
								}
							/>
						</label>
						<div className="of-form-full of-check-grid">
							{(["typecheck", "lint", "test", "build"] as const).map((key) => (
								<label key={key}>
									<input
										checked={form.verification[key]}
										type="checkbox"
										onChange={(event) =>
											setForm((current) => ({
												...current,
												verification: { ...current.verification, [key]: event.target.checked },
											}))
										}
									/>
									<span>{key}</span>
								</label>
							))}
						</div>
						{validationError || submitError ? <div className="of-form-error">{validationError ?? submitError}</div> : null}
						<button className="of-primary-action of-form-submit" disabled={Boolean(validationError) || createTask.isPending} type="submit">
							<Play aria-hidden="true" size={15} />
							{createTask.isPending ? "Queueing..." : "Queue now"}
						</button>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
