import dagre from '@dagrejs/dagre';
import { Position, type Edge, type Node } from '@xyflow/react';
import type { Analysis, Project } from '@/core/types';
import type { TaskNodeData } from '@/features/dashboard/TaskNode';

const NODE_W = 210;
const NODE_H = 88;

export function buildGraphElements(
  project: Project,
  analysis: Analysis,
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const members = new Map(project.members.map((m) => [m.id, m]));
  const critical = new Set(analysis.criticalPath);

  const nodes: Node<TaskNodeData>[] = project.tasks.map((task) => {
    const metrics = analysis.tasks[task.id];
    const owner = task.ownerId ? members.get(task.ownerId) : undefined;
    const isBottleneck = analysis.bottleneckTaskId === task.id;
    return {
      id: task.id,
      type: 'task',
      position: { x: 0, y: 0 },
      data: {
        title: task.title,
        ownerName: owner?.name ?? 'Unassigned',
        remainingHours: metrics?.remainingHours ?? 0,
        status: task.status,
        ownerColor: owner?.color ?? '#78716c',
        isCritical: critical.has(task.id),
        isBottleneck,
        downstreamCount: metrics?.downstreamCount ?? 0,
      },
    };
  });

  const edges: Edge[] = [];
  for (const task of project.tasks) {
    for (const dep of task.dependsOn) {
      const onCritical = critical.has(dep) && critical.has(task.id);
      edges.push({
        id: `${dep}->${task.id}`,
        source: dep,
        target: task.id,
        animated: false,
        style: {
          stroke: onCritical ? '#1c1917' : '#a8a29e',
          strokeWidth: onCritical ? 3 : 1.5,
        },
        label: onCritical ? 'critical' : undefined,
        labelStyle: { fill: '#1c1917', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#fafaf9' },
      });
    }
  }

  return layoutLtr(nodes, edges);
}

function layoutLtr(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 72, marginx: 24, marginy: 24 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_W, height: NODE_H });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  const laidOut = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: {
        x: pos.x - NODE_W / 2,
        y: pos.y - NODE_H / 2,
      },
    };
  });

  return { nodes: laidOut, edges };
}
