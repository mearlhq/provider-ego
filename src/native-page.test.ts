import { expect, it, vi } from 'vitest';
const setup = vi.hoisted(() => ({ options: undefined as any, suspend: vi.fn(), dispose: vi.fn() }));
vi.mock('@mearl/native-host/external-page-host', () => ({ createExternalPageHost: async (options: any) => {
  setup.options = options;
  return { suspend: setup.suspend, dispose: setup.dispose };
} }));

it('multiplexes native replies without losing refreshed SDK callbacks or task selection', async () => {
  vi.useFakeTimers();
  let selected: number | undefined;
  const sent: any[] = [];
  const sdkReceive = vi.fn();
  const ego = { useTaskSpace: (id: number) => { selected = id; }, listTabs: vi.fn(async () => []),
    onCDPMessage: sdkReceive, onSendCDPMessageError: vi.fn(),
    sendCDPMessage: (raw: string) => { sent.push({ ...JSON.parse(raw), selected }); },
  };
  vi.stubGlobal('ego', ego);
  const { nativePage, disposeNativePages } = await import('./native-page.js');
  const page = { targetId: undefined as string | undefined, url: async () => { page.targetId = 'target'; return 'https://example.test'; } };
  await nativePage(9, 1, page, { cdp: async () => ({ sessionId: 'session' }) });
  ego.listTabs.mockClear();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(ego.listTabs).not.toHaveBeenCalled();
  setup.options.onHostActivity(true);
  await vi.advanceTimersByTimeAsync(250);
  expect(ego.listTabs).toHaveBeenCalledOnce();
  setup.options.onHostActivity(false);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(ego.listTabs).toHaveBeenCalledOnce();
  const transport = setup.options.transport;
  const receive = vi.fn();
  transport.subscribe(receive, vi.fn());
  transport.send(JSON.stringify({ id: 1, sessionId: 'session', method: 'Runtime.enable' }));
  expect(sent[0]).toMatchObject({ selected: 9, sessionId: 'session' });
  expect(sent[0].id).not.toBe(1);
  ego.onCDPMessage(JSON.stringify({ id: sent[0].id, result: {} }));
  expect(JSON.parse(receive.mock.calls[0][0]).id).toBe(1);
  const refreshed = vi.fn();
  ego.onCDPMessage = refreshed;
  ego.sendCDPMessage(JSON.stringify({ id: 25, method: 'Target.getTargets' }));
  ego.onCDPMessage(JSON.stringify({ id: 25, result: {} }));
  expect(refreshed).toHaveBeenCalledOnce();
  ego.onCDPMessage(JSON.stringify({ method: 'Page.loadEventFired', sessionId: 'session', params: {} }));
  expect(receive).toHaveBeenCalledTimes(2);
  transport.send(JSON.stringify({ id: 2, method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true } }));
  expect(sent.at(-1).params).toEqual({ enabled: false });
  transport.close();
  const keptPage = { targetId: 'kept-target', url: async () => 'https://example.test/result' };
  const keptTask = { cdp: vi.fn(async () => ({ sessionId: 'kept-session' })) };
  await nativePage(9, 2, keptPage, keptTask);
  ego.onCDPMessage(JSON.stringify({ method: 'Target.detachedFromTarget', params: { sessionId: 'child-session' } }));
  await Promise.resolve();
  expect(setup.dispose).not.toHaveBeenCalled();
  ego.onCDPMessage(JSON.stringify({ method: 'Target.detachedFromTarget', params: { sessionId: 'session' } }));
  await Promise.resolve();
  expect(setup.dispose).toHaveBeenCalledOnce();
  await nativePage(9, 2, keptPage, keptTask);
  expect(keptTask.cdp).toHaveBeenCalledOnce();
  await disposeNativePages();
  expect(setup.dispose).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
