"use client";

import { useMemo } from "react";
import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { ActiveRun, AgentGraphNode } from "@agentdeck/core";

const statusAccent: Record<AgentGraphNode["status"], string> = {
	blocked: "var(--amber)",
	complete: "var(--green)",
	idle: "var(--border-strong)",
	running: "var(--cyan)",
	waiting: "var(--amber)",
};

export function AgentFlowGraph({
	onSelectNode,
	run,
	selectedNodeId,
}: {
	onSelectNode: (nodeId: string) => void;
	run: ActiveRun;
	selectedNodeId: string;
}) {
	const nodes = useMemo<Node[]>(
		() =>
			run.graphNodes.map((node) => ({
				data: {
					label: (
						<div className="of-flow-node-copy">
							<strong>{node.label}</strong>
							<span>{node.subtitle}</span>
							<em>{node.metric}</em>
						</div>
					),
				},
				id: node.id,
				position: {
					x: node.x * 7.8,
					y: node.y * 3.1,
				},
				selected: node.id === selectedNodeId,
				style: {
					background: node.status === "running" ? "rgba(53, 213, 255, 0.12)" : "rgba(9, 14, 24, 0.94)",
					border: `1px solid ${statusAccent[node.status]}`,
					borderRadius: 8,
					boxShadow: node.id === selectedNodeId ? "0 0 0 3px rgba(53, 213, 255, 0.1)" : "none",
					color: "var(--foreground)",
					fontSize: 12,
					minHeight: 72,
					padding: 10,
					width: 148,
				},
			})),
		[run.graphNodes, selectedNodeId],
	);
	const edges = useMemo<Edge[]>(
		() =>
			run.graphEdges.map((edge) => ({
				animated: edge.status === "active",
				id: edge.id,
				source: edge.from,
				style: {
					stroke:
						edge.status === "active" ? "var(--cyan)" : edge.status === "complete" ? "var(--green)" : "var(--border-strong)",
					strokeWidth: edge.status === "active" ? 2 : 1.4,
				},
				target: edge.to,
			})),
		[run.graphEdges],
	);

	return (
		<div className="of-flow-graph" aria-label="Interactive agent orchestration graph">
			<ReactFlow
				edges={edges}
				fitView
				maxZoom={1.35}
				minZoom={0.56}
				nodes={nodes}
				nodesConnectable={false}
				nodesDraggable={false}
				onNodeClick={(_, node) => onSelectNode(node.id)}
				panOnScroll
				proOptions={{ hideAttribution: true }}
				zoomOnDoubleClick={false}
			>
				<Background color="rgba(148, 163, 184, 0.16)" gap={28} size={1} />
			</ReactFlow>
		</div>
	);
}
