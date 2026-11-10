import { createExternalPageHost, type CdpTransport } from '@mearl/native-host/external-page-host';

const ego = (globalThis as any).ego;
type Host = Awaited<ReturnType<typeof createExternalPageHost>>;
const hosts = new Map<string, { host: Promise<Host>; targetId: string; sessionId?: string }>();
let nextId = 1_000_000_000;
const pending = new Map<number, { id: number; receive(message: string): void; spaceId: number }>();
const channels = new Set<{ receive(message: string): void; closed(): void }>();
let installed = false;
let probing = false;
let monitor: ReturnType<typeof setInterval> | undefined;
const activeHosts = new Set<string>();
function hostActivity(key: string, active: boolean) {
  if (active) activeHosts.add(key); else activeHosts.delete(key);
  if (!activeHosts.size) { clearInterval(monitor); monitor = undefined; }
  else if (!monitor) { monitor = setInterval(probeControl, 250); monitor.unref(); }
}
async function probeControl() {
  if (probing || !activeHosts.size) return;
  probing = true;
  try {
    for (const id of new Set([...activeHosts].map(key => Number(key.split(':')[0])))) {
      try { await assertEgoControl(id); }
      catch { for (const [key, entry] of hosts) if (key.startsWith(`${id}:`)) void entry.host.then(host => host.suspend()).catch(() => {}); }
    }
  } finally { probing = false; }
}

function installMux() {
  if (installed) return;
  installed = true;
  let originalMessage = ego.onCDPMessage;
  let originalError = ego.onSendCDPMessageError;
  const receive = (raw: string) => {
    const message = JSON.parse(raw);
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const route = pending.get(message.id)!; pending.delete(message.id);
      route.receive(JSON.stringify({ ...message, id: route.id })); return;
    }
    if (!message.id) for (const channel of channels) channel.receive(raw);
    if (message.method === 'Target.detachedFromTarget' && typeof message.params?.sessionId === 'string') {
      for (const [key, entry] of hosts) if (entry.sessionId === message.params.sessionId) {
        hosts.delete(key);
        hostActivity(key, false);
        void entry.host.then(host => host.dispose()).catch(() => {});
      }
    }
    originalMessage?.(raw);
  };
  // Ego's send-error callback has no request ID. Reject all pending native work;
  // attributing it to one command would risk continuing after a lost task lease.
  const failed = (message: string, code?: string) => {
    for (const route of pending.values()) route.receive(JSON.stringify({ id: route.id, error: { message: `${code ?? 'EGO_CDP_ERROR'}: ${message}` } }));
    pending.clear();
    for (const entry of hosts.values()) void entry.host.then(host => host.suspend()).catch(() => {});
    originalError?.(message, code);
  };
  const send = ego.sendCDPMessage.bind(ego);
  // Ego SDK refreshes its callbacks before every send. Reattach the multiplexer
  // at the native send boundary and preserve the SDK's newest callbacks.
  ego.sendCDPMessage = (message: string) => {
    if (ego.onCDPMessage !== receive) originalMessage = ego.onCDPMessage;
    if (ego.onSendCDPMessageError !== failed) originalError = ego.onSendCDPMessageError;
    ego.onCDPMessage = receive;
    ego.onSendCDPMessageError = failed;
    return send(message);
  };
}

export async function assertEgoControl(spaceId: number) {
  ego.useTaskSpace(spaceId);
  const result = await ego.listTabs();
  if (result?.error) throw new Error(`${result.error_code}: ${result.error}`);
}

function transport(spaceId: number): CdpTransport {
  let route: { receive(message: string): void; closed(): void } | undefined;
  let closed = false;
  return {
    identity: `ego:${spaceId}`,
    subscribe(receive, onClose) { route = { receive, closed: onClose }; channels.add(route); return () => { if (route) channels.delete(route); }; },
    send(raw) {
      if (closed || !route) throw new Error('Ego native transport is closed');
      const message = JSON.parse(raw);
      if (message.method === 'Emulation.setEmitTouchEventsForMouse') message.params = { enabled: false };
      const id = nextId++;
      pending.set(id, { id: message.id, receive: route.receive, spaceId });
      ego.useTaskSpace(spaceId);
      try { ego.sendCDPMessage(JSON.stringify({ ...message, id })); }
      catch (error) { pending.delete(id); throw error; }
    },
    close() {
      closed = true;
      if (route) channels.delete(route);
      for (const [id, value] of pending) if (value.receive === route?.receive) pending.delete(id);
    },
  };
}

export async function nativePage(spaceId: number, tabId: number, page: any, task: any): Promise<Host> {
  installMux();
  await assertEgoControl(spaceId);
  const url = await page.url();
  const key = `${spaceId}:${tabId}`;
  let entry = hosts.get(key);
  if (entry && entry.targetId !== page.targetId) {
    await (await entry.host).dispose(); hosts.delete(key); entry = undefined;
  }
  if (!entry) {
    const targetId = page.targetId;
    let host!: Promise<Host>;
    host = (async () => {
      const { sessionId } = await task.cdp('Target.attachToTarget', { targetId, flatten: true });
      const current = hosts.get(key);
      if (current?.host === host) current.sessionId = sessionId;
      return createExternalPageHost({ tabId, targetId, sessionId, url, transport: transport(spaceId), assertControl: () => assertEgoControl(spaceId), onHostActivity: active => {
        if (hosts.get(key)?.host === host) hostActivity(key, active);
      } });
    })();
    hosts.set(key, { host, targetId });
    try { return await host; } catch (error) { hosts.delete(key); hostActivity(key, false); throw error; }
  }
  return entry.host;
}

export async function disposeNativePages(spaceId?: number, tabId?: number) {
  for (const [key, entry] of hosts) {
    if ((spaceId !== undefined && !key.startsWith(`${spaceId}:`)) || (tabId !== undefined && key !== `${spaceId}:${tabId}`)) continue;
    hosts.delete(key); hostActivity(key, false); await (await entry.host).dispose();
  }
}
