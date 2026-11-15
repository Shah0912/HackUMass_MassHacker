// F-05 Dependency graph: left-to-right dagre layout, critical path and linchpin marked
// with shape + text (never colour alone), click to focus a task's chain.
import { memo, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Graph, layout } from '@dagrejs/dagre';
import type { Analysis, Member, Project, Task } from '@/core/types';
import { fmtH } from '@/engine';
import { relatedTasks } from '@/store/taskOps';
import { STATUS_COLOR, StatusBadge, cn } from '@/components/ui';
import { IconFlag, IconPin } from '@/components/icons';
import { writeTaskDrag } from '@/features/whatif/drag';

export type ColorBy = 'owner' | 'status';

export interface GraphView {
  colorBy: ColorBy;
  hideDone: boolean;
  criticalOnly: boolean;
  memberFilter: string | null;
}

type TaskNodeData = {
  task: Task;
  owner: Member | undefined;
  remaining: number;
  critical: boolean;
  linchpin: boolean;
  downstream: number;
  borderColor: string;
  dimmed: boolean;
  highlighted: boolean;
  selected: boolean;
  reassignable: boolean;
  onReassignDragStart?: () => void;
};
type TaskNodeType = Node<TaskNodeData, 'task'>;

const W = 230;
const W_LINCHPIN = 270;
const H = 92;
const H_LINCHPIN = 112;
const MIN_READABLE_ZOOM = 0.8;

const TaskNode = memo(function TaskNode({ data }: NodeProps<TaskNodeType>) {
  const { task, owner, remaining, critical, linchpin, downstream, borderColor, dimmed, highlighted, selected, reassignable } = data;
  return (
    <div
      draggable={reassignable}
      title={reassignable ? 'Drag onto a person to reassign' : undefined}
      onDragStart={(e) => {
        if (!reassignable) return;
        writeTaskDrag(e.dataTransfer, task.id);
        data.onReassignDragStart?.();
      }}
      className={cn(
        'relative flex flex-col justify-between rounded-xl bg-white px-3 py-2 text-left shadow-sm transition-opacity',
        reassignable && 'cursor-grab active:cursor-grabbing',
        dimmed && 'opacity-25',
        task.status === 'done' && 'bg-slate-50',
      )}
      style={{
        width: linchpin ? W_LINCHPIN : W,
        height: linchpin ? H_LINCHPIN : H,
        border: `${critical ? 4 : 2}px ${task.status === 'done' ? 'dashed' : 'solid'} ${borderColor}`,
        boxShadow: selected
          ? '0 0 0 4px rgba(37,99,235,.45)'
          : highlighted
            ? '0 0 0 4px rgba(245,158,11,.6)'
            : linchpin
              ? '0 0 0 6px rgba(220,38,38,.18), 0 8px 24px rgba(220,38,38,.25)'
              : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      {(critical || linchpin) && (
        <div className="absolute -top-3 left-2 flex gap-1">
          {linchpin && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
              <IconPin size={11} /> Linchpin · blocks {downstream}
            </span>
          )}
          {critical && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
              <IconFlag size={11} /> Critical
            </span>
          )}
        </div>
      )}
      <p className={cn('line-clamp-2 font-semibold leading-snug text-slate-900', linchpin ? 'mt-1.5 text-[15px]' : 'mt-0.5 text-[13px]', task.status === 'done' && 'text-slate-500 line-through')}>
        {task.title || <em className="font-normal text-slate-400">Untitled</em>}
      </p>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1 text-slate-700">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: owner?.color ?? '#cbd5e1' }} />
          <span className="truncate">{owner?.name ?? 'Unassigned'}</span>
        </span>
        <span className="shrink-0 tabular-nums text-slate-600">{remaining > 0 ? `${fmtH(remaining)} left` : 'No work left'}</span>
      </div>
      <div className="flex items-center justify-between">
        <StatusBadge status={task.status} />
        {!linchpin && downstream >= 3 && <span className="text-[11px] font-medium text-slate-500">blocks {downstream}</span>}
      </div>
    </div>
  );
});

const nodeTypes = { task: TaskNode };

export function GraphCanvas(props: {
  project: Project;
  analysis: Analysis;
  view: GraphView;
  selectedTaskId: string | null;
  highlightTaskIds: Set<string>;
  onSelectTask: (id: string | null) => void;
  /** What-if: nodes can be dragged onto a person to reassign them. */
  reassignable?: boolean;
  onReassignDragStart?: () => void;
}) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphInner({ project, analysis, view, selectedTaskId, highlightTaskIds, onSelectTask, reassignable = false, onReassignDragStart }: Parameters<typeof GraphCanvas>[0]) {
  const { fitView, setViewport } = useReactFlow();
  const memberById = useMemo(() => new Map(project.members.map((m) => [m.id, m])), [project.members]);

  const visible = useMemo(
    () =>
      project.tasks.filter((t) => {
        if (t.cut || !analysis.tasks[t.id]) return false;
        if (view.hideDone && t.status === 'done') return false;
        if (view.criticalOnly && !analysis.tasks[t.id]!.isCritical) return false;
        return true;
      }),
    [project.tasks, analysis, view.hideDone, view.criticalOnly],
  );
  const visibleIds = useMemo(() => new Set(visible.map((t) => t.id)), [visible]);

  // Layout depends only on structure, so editing a title doesn't move nodes.
  const structureKey = visible.map((t) => `${t.id}:${t.dependsOn.join(',')}:${t.id === analysis.bottleneckTaskId}`).join('|');
  const positions = useMemo(() => {
    const g = new Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 70, marginx: 20, marginy: 30 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const t of visible) {
      const big = t.id === analysis.bottleneckTaskId;
      g.setNode(t.id, { width: big ? W_LINCHPIN : W, height: (big ? H_LINCHPIN : H) + 14 });
    }
    for (const t of visible) for (const d of effectiveVisibleDeps(t, project, visibleIds)) g.setEdge(d, t.id);
    layout(g);
    const pos = new Map<string, { x: number; y: number }>();
    for (const t of visible) {
      const n = g.node(t.id);
      const big = t.id === analysis.bottleneckTaskId;
      pos.set(t.id, { x: n.x - (big ? W_LINCHPIN : W) / 2, y: n.y - (big ? H_LINCHPIN : H) / 2 });
    }
    return pos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  const focus = useMemo(() => (selectedTaskId ? relatedTasks(project, selectedTaskId) : null), [project, selectedTaskId]);
  const criticalEdges = useMemo(() => {
    const s = new Set<string>();
    for (let i = 1; i < analysis.criticalPath.length; i++) s.add(`${analysis.criticalPath[i - 1]}->${analysis.criticalPath[i]}`);
    return s;
  }, [analysis.criticalPath]);

  const inFocus = (id: string) => !focus || id === selectedTaskId || focus.upstream.has(id) || focus.downstream.has(id);
  const inMember = (t: Task) => !view.memberFilter || t.ownerId === view.memberFilter;

  const nodes: TaskNodeType[] = visible.map((t) => {
    const m = analysis.tasks[t.id]!;
    const owner = t.ownerId ? memberById.get(t.ownerId) : undefined;
    return {
      id: t.id,
      type: 'task',
      position: positions.get(t.id) ?? { x: 0, y: 0 },
      draggable: false,
      className: reassignable ? 'nodrag nopan' : undefined,
      ariaLabel: `${t.title}. ${owner?.name ?? 'Unassigned'}. ${m.isCritical ? 'On the critical path. ' : ''}${t.id === analysis.bottleneckTaskId ? `Linchpin, blocks ${m.downstreamCount} tasks. ` : ''}`,
      data: {
        task: t,
        owner,
        remaining: m.remainingHours,
        critical: m.isCritical,
        linchpin: t.id === analysis.bottleneckTaskId,
        downstream: m.downstreamCount,
        borderColor: view.colorBy === 'owner' ? owner?.color ?? '#94a3b8' : STATUS_COLOR[t.status],
        dimmed: !inFocus(t.id) || !inMember(t),
        highlighted: highlightTaskIds.has(t.id),
        selected: t.id === selectedTaskId,
        reassignable,
        onReassignDragStart,
      },
    };
  });

  const taskById = new Map(project.tasks.map((t) => [t.id, t]));
  const edges: Edge[] = visible.flatMap((t) =>
    effectiveVisibleDeps(t, project, visibleIds).map((d) => {
      const id = `${d}->${t.id}`;
      const crit = criticalEdges.has(id);
      const dim = !(inFocus(d) && inFocus(t.id)) || !(inMember(taskById.get(d)!) || inMember(t));
      return {
        id,
        source: d,
        target: t.id,
        type: 'smoothstep',
        style: { stroke: crit ? '#0f172a' : '#94a3b8', strokeWidth: crit ? 3.5 : 1.5, strokeDasharray: crit ? undefined : '0', opacity: dim ? 0.15 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: crit ? '#0f172a' : '#94a3b8', width: 16, height: 16 },
        zIndex: crit ? 1 : 0,
      };
    }),
  );

  // Fit the whole graph if it stays readable; otherwise keep text readable and start from the
  // left (where the chain, and usually the linchpin, begins). Users can pan or press fit.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const el = wrapRef.current;
      if (!el || positions.size === 0) return;
      const { width: vw, height: vh } = el.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [tid, p] of positions) {
        const big = tid === analysis.bottleneckTaskId;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y - 14);
        maxX = Math.max(maxX, p.x + (big ? W_LINCHPIN : W));
        maxY = Math.max(maxY, p.y + (big ? H_LINCHPIN : H));
      }
      const pad = 40;
      const fit = Math.min((vw - 2 * pad) / (maxX - minX), (vh - 2 * pad) / (maxY - minY));
      if (fit >= MIN_READABLE_ZOOM) {
        fitView({ padding: 0.12, duration: 300, maxZoom: 1.1 });
      } else {
        const z = Math.min(MIN_READABLE_ZOOM, (vh - 2 * pad) / (maxY - minY));
        setViewport({ x: pad - minX * z, y: vh / 2 - ((minY + maxY) / 2) * z, zoom: z }, { duration: 300 });
      }
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, fitView, setViewport]);

  if (visible.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-600">
        {view.criticalOnly || view.hideDone ? 'No tasks match these filters.' : 'No tasks yet. Add some on the review screen.'}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="h-full w-full">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelectTask(n.id)}
      onPaneClick={() => onSelectTask(null)}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.2}
      maxZoom={1.75}
      proOptions={{ hideAttribution: true }}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        const id = target.closest('.react-flow__node')?.getAttribute('data-id');
        if (e.key === 'Enter' && id) onSelectTask(id);
      }}
    >
      <Background gap={20} color="#e2e8f0" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
    </div>
  );
}

/** Dependencies that are visible, skipping over hidden/cut tasks so the chain stays connected. */
function effectiveVisibleDeps(task: Task, project: Project, visibleIds: Set<string>): string[] {
  const byId = new Map(project.tasks.map((t) => [t.id, t]));
  const out = new Set<string>();
  const seen = new Set<string>();
  const stack = [...task.dependsOn];
  while (stack.length) {
    const d = stack.pop()!;
    if (seen.has(d)) continue;
    seen.add(d);
    if (visibleIds.has(d)) out.add(d);
    else stack.push(...(byId.get(d)?.dependsOn ?? []));
  }
  return [...out];
}
