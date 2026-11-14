import { useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Analysis, Project } from '@/core/types';
import { buildGraphElements } from '@/features/dashboard/layoutGraph';
import { TaskNode } from '@/features/dashboard/TaskNode';

const nodeTypes = { task: TaskNode };

function GraphInner({ project, analysis }: { project: Project; analysis: Analysis }) {
  const { nodes, edges } = useMemo(
    () => buildGraphElements(project, analysis),
    [project, analysis],
  );

  return (
    <div className="h-[520px] w-full overflow-hidden rounded-md border border-stone-300 bg-stone-50">
      <ReactFlow
        key={project.id}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} color="#e7e5e4" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
      </ReactFlow>
    </div>
  );
}

export function DependencyGraph(props: { project: Project; analysis: Analysis }) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
