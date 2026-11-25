import { expect, it, vi } from 'vitest';
import { createEgoProvider } from './provider.js';
import { parseMacBrowserPids } from './discovery.js';

const stopped = async () => undefined;

it('keeps a delegated Space visible and detaches without finishing it', async () => {
  const captureActions = ['tab_checkpoint', 'get_requests', 'get_logs'];
  const request = vi.fn()
    .mockResolvedValueOnce({ id: 8, name: 'fixture', ownership: 'agent', captureActions })
    .mockResolvedValueOnce([{ id: 8, ownership: 'agentDelegatedToUser' }]);
  const provider = createEgoProvider({ request } as any, undefined, stopped);
  await provider.launch({ name: 'fixture' }, {});
  const browsers = await provider.listBrowsers!({});
  expect(browsers).toHaveLength(1);
  expect(browsers[0].control).toMatchObject({ capabilities: {
    controlSessionMode: 'external', actions: expect.arrayContaining(captureActions),
  } });
  await provider.detach!({ browserId: 'space-8' }, {});
  expect(await provider.listBrowsers!({})).toEqual([]);
  expect(request.mock.calls.map(call => call[0])).toEqual(['launch', 'list', 'release']);
});

it('rejects arbitrary Space IDs before dispatching actions', async () => {
  const request = vi.fn();
  const provider = createEgoProvider({ request } as any);
  await expect(provider.handleAction!({ browserId: 'space-0', action: 'page_eval', data: { tabId: 1, expression: '1' } })).rejects.toThrow('not attached');
  expect(request).not.toHaveBeenCalled();
});

it('routes task lifecycle through the attached browser and removes it only after successful finish', async () => {
  const request = vi.fn().mockResolvedValue({ id: 8, name: 'fixture' });
  const control = vi.fn().mockResolvedValue({});
  const publish = vi.fn();
  const provider = createEgoProvider({ request, control } as any, publish, stopped);
  await provider.launch({ name: 'fixture' }, {});
  await provider.control!({ browserId: 'space-8', operation: 'handoff' }, { deadline: 123 });
  expect(control).toHaveBeenLastCalledWith('handoff', { spaceId: 8 }, 123);
  control.mockRejectedValueOnce(new Error('USER_IN_CONTROL'));
  await expect(provider.control!({ browserId: 'space-8', operation: 'finish' }, {})).rejects.toThrow('USER_IN_CONTROL');
  await provider.control!({ browserId: 'space-8', operation: 'resume' }, {});
  await provider.control!({ browserId: 'space-8', operation: 'finish', keepTabIds: [2, 4] }, {});
  expect(control).toHaveBeenLastCalledWith('finish', { spaceId: 8, keep: ['p2', 'p4'] }, undefined);
  expect(publish).toHaveBeenLastCalledWith([]);
  await expect(provider.control!({ browserId: 'space-8', operation: 'resume' }, {})).rejects.toThrow('not attached');
});

it('discovers the running app without starting the CLI or allocating a Space', async () => {
  const request = vi.fn();
  const provider = createEgoProvider({ request } as any, undefined, async () => ({ pid: 12, connected: true }));
  expect(await provider.listBrowsers!({})).toMatchObject([{
    browserId: 'local', status: 'connected', details: { taskSessionScope: 'browser' },
  }]);
  expect(request).not.toHaveBeenCalled();
  expect(parseMacBrowserPids(' 12 /Applications/ego lite.app/Contents/MacOS/ego lite\n 13 /Applications/ego lite.app/Contents/Helpers/ego Helper\n')).toEqual([12]);
});

it('gives a Space at most one session owner and passes unmodified numeric attach IDs', async () => {
  const request = vi.fn().mockResolvedValue({ id: 8, name: 'fixture' });
  const provider = createEgoProvider({ request } as any, undefined, stopped);
  const space = await provider.launch({ taskSession: { browserId: 'local' }, spaceId: 8 }, {});
  expect(request).toHaveBeenCalledWith('launch', { spaceId: 8 }, undefined);
  expect(space.details?.taskSessionScope).toBe('session');
  await expect(provider.launch({ spaceId: 8 }, {})).rejects.toThrow('EGO_SPACE_IN_USE');
});

it('allows an existing Space to be reattached after the Mearl control host restarts', async () => {
  let owner = 'first';
  const request = vi.fn().mockResolvedValue({ id: 8, name: 'fixture' });
  const provider = createEgoProvider({ request } as any, undefined, stopped, () => owner);
  await provider.launch({ taskSession: { browserId: 'local' }, spaceId: 8 }, {});
  owner = 'second';
  await expect(provider.launch({ taskSession: { browserId: 'local' }, spaceId: 8 }, {})).resolves.toMatchObject({ browserId: 'space-8' });
  expect(request.mock.calls.map(call => call[0])).toEqual(['launch', 'launch']);
});

it('keeps a session target registered during a read-only inventory timeout', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce({ id: 8, name: 'fixture' })
    .mockRejectedValueOnce(new Error('EGO_PROBE_TIMEOUT: read-only probe timed out'));
  const provider = createEgoProvider({ request } as any, undefined, stopped);
  await provider.launch({ taskSession: { browserId: 'local' }, spaceId: 8 }, {});
  await expect(provider.listBrowsers!({})).resolves.toMatchObject([{ browserId: 'space-8' }]);
});
