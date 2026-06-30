"use client";

import { useQuery } from "@tanstack/react-query";
import type {
	ActiveRun,
	AgentInstallation,
	AuditTrailEntry,
	DecisionReport,
	EvalRunSummary,
	ObservabilityMetric,
	PolicyRule,
	QueueItem,
	RetentionPolicy,
	ScheduledJob,
	WorkspaceMember,
	WorkspaceSummary,
} from "@agentdeck/core";
import {
	activeRun,
	agentInstallations,
	auditTrail,
	decisionReport,
	evalRuns,
	observabilityMetrics,
	policyRules,
	queueItems,
	retentionPolicies,
	scheduledJobs,
	workspaceMembers,
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

export function useObservabilityMetrics() {
	return useQuery<ObservabilityMetric[]>({
		initialData: observabilityMetrics,
		queryFn: () => apiFallback("/api/metrics", observabilityMetrics),
		queryKey: ["observability-metrics"],
	});
}

export function useAuditTrail() {
	return useQuery<AuditTrailEntry[]>({
		initialData: auditTrail,
		queryFn: () => apiFallback("/api/audit", auditTrail),
		queryKey: ["audit-trail"],
	});
}

export function useEvalRuns() {
	return useQuery<EvalRunSummary[]>({
		initialData: evalRuns,
		queryFn: () => apiFallback("/api/evals", evalRuns),
		queryKey: ["eval-runs"],
	});
}

export function useWorkspaceMembers() {
	return useQuery<WorkspaceMember[]>({
		initialData: workspaceMembers,
		queryFn: () => apiFallback("/api/members", workspaceMembers),
		queryKey: ["workspace-members"],
	});
}

export function useRetentionPolicies() {
	return useQuery<RetentionPolicy[]>({
		initialData: retentionPolicies,
		queryFn: () => apiFallback("/api/retention", retentionPolicies),
		queryKey: ["retention-policies"],
	});
}
