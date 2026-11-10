import { expect, it, vi } from 'vitest';
import { createEgoProvider } from './provider.js';

it('keeps a delegated Space visible and detaches without finishing it', async () => {
  const request = vi.fn().mockResolvedValueOnce({ id: 8, name: 'fixture', ownership: 'agent' }).mockResolvedValueOnce([{ id: 8, ownership: 'agentDelegatedToUser' }]);
  const provider = createEgoProvider({ request } as any);
  await provider.launch({ name: 'fixture' }, {});
  const browsers = await provider.listBrowsers!({});
  expect(browsers).toHaveLength(1);
  expect(browsers[0].control).toMatchObject({ capabilities: { controlSessionMode: 'external' } });
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
  const provider = createEgoProvider({ request, control } as any, publish);
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
