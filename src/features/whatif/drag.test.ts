import { describe, expect, it } from 'vitest';
import { TASK_DRAG_TYPE, isTaskDrag, readTaskDrag, writeTaskDrag } from './drag';

/** Node's test environment has no DataTransfer, so this stands in for a drag payload. */
function fakeTransfer(initial?: Record<string, string>): DataTransfer {
  const store = new Map(Object.entries(initial ?? {}));
  return {
    effectAllowed: 'none',
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) => store.get(type) ?? '',
    get types() {
      return store.keys();
    },
  } as unknown as DataTransfer;
}

describe('task drag payload', () => {
  it('round-trips the task id and marks the drag as a move', () => {
    const data = fakeTransfer();
    writeTaskDrag(data, 't2');
    expect(isTaskDrag(data)).toBe(true);
    expect(readTaskDrag(data)).toBe('t2');
    expect(data.effectAllowed).toBe('move');
  });

  it('ignores a drag that is not a task', () => {
    const data = fakeTransfer({ 'text/plain': 'hello' });
    expect(isTaskDrag(data)).toBe(false);
    expect(readTaskDrag(data)).toBe('');
  });

  it('uses the ClearPath drag type', () => {
    expect(TASK_DRAG_TYPE).toBe('application/x-clearpath-task');
  });
});
