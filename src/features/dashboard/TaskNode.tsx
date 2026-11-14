import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type TaskNodeData = {
  title: string;
  ownerName: string;
  remainingHours: number;
  status: string;
  ownerColor: string;
  isCritical: boolean;
  isBottleneck: boolean;
  downstreamCount: number;
};

export type TaskFlowNode = Node<TaskNodeData, 'task'>;

export function TaskNode({ data }: NodeProps<TaskFlowNode>) {
  const sizeClass = data.isBottleneck ? 'min-w-[200px] scale-105' : 'min-w-[180px]';
  const weightClass = data.isCritical
    ? 'border-[3px] border-stone-900 shadow-md'
    : 'border border-stone-300 shadow-sm';

  return (
    <div
      className={`rounded-md bg-white px-3 py-2 ${sizeClass} ${weightClass}`}
      style={{ borderLeftWidth: 6, borderLeftColor: data.ownerColor }}
    >
      <Handle type="target" position={Position.Left} className="!bg-stone-500" />
      <div className="flex flex-wrap items-center gap-1.5">
        {data.isCritical && (
          <span className="rounded bg-stone-900 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
            critical
          </span>
        )}
        {data.isBottleneck && (
          <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
            blocks {data.downstreamCount}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm font-semibold text-stone-900">{data.title}</p>
      <p className="mt-0.5 text-xs text-stone-600">
        {data.ownerName} · {data.remainingHours}h left · {data.status.replace('_', ' ')}
      </p>
      <Handle type="source" position={Position.Right} className="!bg-stone-500" />
    </div>
  );
}
