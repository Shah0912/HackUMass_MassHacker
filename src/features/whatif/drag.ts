/** Payload type for dragging a graph node onto a person to reassign it. */
export const TASK_DRAG_TYPE = 'application/x-linchpin-task';

export function writeTaskDrag(data: DataTransfer, taskId: string): void {
  data.setData(TASK_DRAG_TYPE, taskId);
  data.effectAllowed = 'move';
}

export function readTaskDrag(data: DataTransfer): string {
  return data.getData(TASK_DRAG_TYPE);
}

export function isTaskDrag(data: DataTransfer): boolean {
  return [...data.types].includes(TASK_DRAG_TYPE);
}
