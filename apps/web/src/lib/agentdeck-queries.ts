"use client";

import { useQuery } from "@tanstack/react-query";
import type {
	ActiveRun,
	AgentInstallation,
	DecisionReport,
	PolicyRule,
	QueueItem,
	ScheduledJob,
	WorkspaceSummary,
} from "@agentdeck/core";
import {
	activeRun,
	agentInstallations,
	decisionReport,
	policyRules,
	queueItems,
	scheduledJobs,
	workspaceSummary,
} from "@/lib/mock-agentdeck";

async function readApiJson(path: string): Promise<unknown> {
	const response = await fetch(path, {
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`GET ${path} failed with ${response.status}`);
	}

	return response.json();
}

async function apiFallback<T>(path: string, fallback: T): Promise<T> {
	try {
		await readApiJson(path);
		return fallback;
	} catch {
		return fallback;
	}
}

export function useActiveRun() {
	return useQuery<ActiveRun>({
		initialData: activeRun,
		queryFn: () => apiFallback(`/api/sessions/${activeRun.sessionId}`, activeRun),
		queryKey: ["active-run", activeRun.id],
	});
}

export function useAgentInventory() {
	return useQuery<AgentInstallation[]>({
		initialData: agentInstallations,
		queryFn: () => apiFallback("/api/machines", agentInstallations),
		queryKey: ["agents"],
	});
}

export function useDecisionReports() {
	return useQuery<DecisionReport[]>({
		initialData: [decisionReport],
		queryFn: () => apiFallback("/api/reports", [decisionReport]),
		queryKey: ["reports"],
	});
}

export function usePolicies() {
	return useQuery<PolicyRule[]>({
		initialData: policyRules,
		queryFn: () => apiFallback("/api/policies", policyRules),
		queryKey: ["policies"],
	});
}

export function useQueueItems() {
	return useQuery<QueueItem[]>({
		initialData: queueItems,
		queryFn: () => apiFallback("/api/queue", queueItems),
		queryKey: ["queue"],
	});
}

export function useScheduledJobs() {
	return useQuery<ScheduledJob[]>({
		initialData: scheduledJobs,
		queryFn: () => apiFallback("/api/schedules", scheduledJobs),
		queryKey: ["schedules"],
	});
}

export function useWorkspaceSummary() {
	return useQuery<WorkspaceSummary>({
		initialData: workspaceSummary,
		queryFn: () => apiFallback(`/api/workspaces/${workspaceSummary.id}`, workspaceSummary),
		queryKey: ["workspace", workspaceSummary.id],
	});
}
