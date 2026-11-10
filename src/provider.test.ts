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
