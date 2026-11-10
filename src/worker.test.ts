import { afterEach, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./native-page.js', () => ({ nativePage: vi.fn(async () => ({ invoke })), disposeNativePages: vi.fn() }));
import { dispatch, tabIdOf, createWorkerDispatcher } from './worker.js';

afterEach(() => vi.unstubAllGlobals());

it('keeps Space discovery responsive while serializing page operations', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const execute = vi.fn(async (operation: string) => operation === 'wait' ? pending : operation);
  const run = createWorkerDispatcher(execute);
  const deadline = Date.now() + 10000;
  const first = run({ operation: 'wait', data: {}, deadline });
  const next = run({ operation: 'click', data: {}, deadline });
  await expect(run({ operation: 'list', data: {}, deadline })).resolves.toBe('list');
  expect(execute.mock.calls.map(call => call[0])).not.toContain('click');
  finish(); await first;
  await expect(next).resolves.toBe('click');
});

it('never issues page commands when Ego rejects the Space', async () => {
  const taskSpace = vi.fn().mockRejectedValue(new Error('EGO_TASK_SPACE_USER_IN_CONTROL'));
  vi.stubGlobal('taskSpace', taskSpace);
  await expect(dispatch('action', { spaceId: 9, action: 'page_eval', payload: { tabId: 1, expression: '1' } })).rejects.toThrow('USER_IN_CONTROL');
  expect(taskSpace).toHaveBeenCalledExactlyOnceWith(9);
});

it('lists only managed pages and does not adopt user tabs', async () => {
  const tabs = vi.fn().mockResolvedValue([{ label: 'p2', title: 'Task', url: 'https://example.com', active: true }, { title: 'User', url: 'https://example.org' }]);
  vi.stubGlobal('taskSpace', vi.fn().mockResolvedValue({ tabs }));
  expect(await dispatch('tabs', { spaceId: 9 })).toEqual({ tabs: [{ tabId: 2, label: 'p2', title: 'Task', url: 'https://example.com', active: true }] });
});

it('routes frame operations through the shared native page host', async () => {
  const page = vi.fn();
  vi.stubGlobal('taskSpace', vi.fn().mockResolvedValue({ page }));
  await dispatch('action', { spaceId: 9, action: 'page_click', payload: { tabId: 1, selector: 'button', frameId: 'other' } });
  expect(page).toHaveBeenCalledWith('p1');
  expect(invoke).toHaveBeenCalledWith('page_click', { tabId: 1, selector: 'button', frameId: 'other' });
});

it('does not create or claim a Space for ambiguous launch parameters', async () => {
  const taskSpace = vi.fn(); vi.stubGlobal('taskSpace', taskSpace);
  await expect(dispatch('launch', { name: 'Task', spaceId: 9 })).rejects.toThrow('exactly one');
  await expect(dispatch('launch', {})).rejects.toThrow('exactly one');
  expect(taskSpace).not.toHaveBeenCalled();
});

it('surfaces native JavaScript errors instead of returning a success', async () => {
  invoke.mockRejectedValueOnce(new Error('ReferenceError: missing'));
  vi.stubGlobal('taskSpace', vi.fn().mockResolvedValue({ page: () => ({}) }));
  await expect(dispatch('action', { spaceId: 9, action: 'page_eval', payload: { tabId: 1, expression: 'missing' } })).rejects.toThrow('ReferenceError');
});

it('rejects aliases and unsafe numeric Page IDs', () => {
  expect(tabIdOf('p17')).toBe(17);
  for (const label of ['user-page', 'p0', 'p-1', 'p999999999999999999999']) expect(() => tabIdOf(label)).toThrow();
});

it('rejects a retained page from another Space before finishing', async () => {
  const finish = vi.fn();
  vi.stubGlobal('taskSpace', vi.fn().mockResolvedValue({ pages: async () => [{ label: 'p2' }], finish }));
  await expect(dispatch('finish', { spaceId: 9, keep: ['p7'] })).rejects.toThrow('must belong');
  expect(finish).not.toHaveBeenCalled();
  await dispatch('finish', { spaceId: 9, keep: ['p2'] });
  expect(finish).toHaveBeenCalledWith({ keep: ['p2'] });
});
