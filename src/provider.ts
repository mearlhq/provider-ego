import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createProviderAppResourceClient, type BrowserProviderDefinition, type ProviderAction, type ProviderBrowser } from '@mearl/provider';
import { EgoBridge } from './bridge.js';
import { describeBrowserCapabilities } from '@mearl/browser-core';
import { discoverEgoBrowser } from './discovery.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const ACTIONS: ProviderAction[] = ['tab_list', 'tab_open', 'tab_close', 'page_navigate', 'page_snapshot', 'page_eval', 'page_click', 'page_type', 'page_press', 'page_scroll', 'page_hover', 'page_wait', 'page_frames', 'page_screenshot', 'page_upload', 'set_timezone', 'set_device_emulation', 'set_app_profile', 'get_capabilities'];

const isUserInControl = (error: unknown) => /EGO_TASK_SPACE_USER_IN_CONTROL|agentDelegatedToUser|user (?:is )?in control/i.test(String(error));

interface AttachedSpace {
  name: string;
  actions: ProviderAction[];
  sessionOwned?: true;
  sessionCreated?: true;
}

export function createEgoProvider(
  initialBridge = new EgoBridge(),
  publish: (browsers: ProviderBrowser[]) => void = () => {},
  discover = discoverEgoBrowser,
  readTaskHost?: () => string | undefined,
): BrowserProviderDefinition & { dispose: () => void } {
  const attached = new Map<number, AttachedSpace>();
  let bridge = initialBridge;
  let instance: ProviderBrowser | undefined;
  let previousPid: number | undefined;
  let taskHost: string | undefined;
  const spaceId = (id: string): number => {
    if (!/^space-\d+$/.test(id) || !attached.has(Number(id.slice(6)))) throw new Error('Ego Space is not attached to this Provider');
    return Number(id.slice(6));
  };
  const browser = (id: number, { name, actions, sessionOwned, sessionCreated }: AttachedSpace): ProviderBrowser => ({
    browserId: `space-${id}`, name, status: 'connected', ownership: 'attached', persistence: 'persistent',
    control: { kind: 'provider', capabilities: { actions, screenshot: 'native', controlSessionMode: 'external' } },
    operations: ['detach', 'handoff', 'resume', 'finish'], references: [{ kind: 'space', id: String(id), label: 'Ego Space' }],
    details: {
      spaceId: id,
      ...(sessionOwned ? { taskSessionScope: 'session', taskSessionBrowserId: 'local' } : {}),
      ...(sessionCreated ? { taskSessionCreated: true } : {}),
    },
  });
  const browsers = () => [
    ...(instance ? [instance] : []),
    ...[...attached].map(([id, value]) => browser(id, value)),
  ];
  let lastProbe = 0;
  let probing: Promise<void> | undefined;
  function refreshTaskHost(): boolean {
    if (!readTaskHost) return true;
    const current = readTaskHost();
    if (taskHost !== current) {
      for (const [id, entry] of attached) if (entry.sessionOwned) attached.delete(id);
      taskHost = current;
      lastProbe = 0;
    }
    if (!current) instance = undefined;
    return current !== undefined;
  }
  function refreshInstance(): Promise<void> {
    if (!refreshTaskHost()) return Promise.resolve();
    if (probing) return probing;
    if (Date.now() - lastProbe < 1000) return Promise.resolve();
    probing = discover().then(running => {
      if (previousPid !== undefined && (!running || (running.pid !== undefined && running.pid !== previousPid))) {
        attached.clear();
        bridge.close();
        bridge = new EgoBridge();
      }
      if (!running || running.pid !== undefined) previousPid = running?.pid;
      instance = running && {
        browserId: 'local', name: 'EgoLite', status: running.connected ? 'connected' : 'running_disconnected',
        ownership: 'attached', persistence: 'persistent', operations: [],
        control: { kind: 'provider', capabilities: { actions: ['get_capabilities'], screenshot: 'none', controlSessionMode: 'external' } },
        details: { taskSessionScope: 'browser' },
      };
    }).finally(() => {
      lastProbe = Date.now();
      probing = undefined;
    });
    return probing;
  }
  return {
    dispose: () => bridge.close(),
    descriptor: { providerId: 'ego', name: 'Ego Lite', version: pkg.version, protocolVersion: 3 },
    browserType: pkg.mearl.provider.browserType,
    async listBrowsers(context) {
      await refreshInstance();
      if (!attached.size) return browsers();
      const deadline = Math.min(context.deadline ?? Infinity, Date.now() + 2000);
      let spaces: { id: number; ownership: string }[];
      try { spaces = await bridge.request('list', {}, deadline); }
      catch (error) {
        if (error instanceof Error && error.message.startsWith('EGO_PROBE_TIMEOUT:')) return browsers();
        throw error;
      }
      for (const id of attached.keys()) {
        const space = spaces.find(item => item.id === id);
        if (!space || !['agent', 'agentDelegatedToUser'].includes(space.ownership)) attached.delete(id);
      }
      return browsers();
    },
    async launch(options, context) {
      const { taskSession, ...space } = options;
      const sessionOwned = taskSession !== undefined;
      if (sessionOwned &&
        (!taskSession || typeof taskSession !== 'object' || Array.isArray(taskSession) || taskSession.browserId !== 'local'))
        throw new Error('Ego task session requires the local browser target');
      if (sessionOwned && !refreshTaskHost())
        throw new Error('The installed Mearl host does not support Provider task sessions');
      if (sessionOwned && space.spaceId === undefined)
        space.name = `${space.name ?? 'Mearl'} (${randomUUID().slice(0, 8)})`;
      const task = await bridge.request('launch', space, context.deadline);
      if (attached.has(task.id) && (sessionOwned || attached.get(task.id)?.sessionOwned))
        throw new Error('EGO_SPACE_IN_USE: this Space already has a Mearl owner');
      const entry: AttachedSpace = {
        name: task.name, actions: [...ACTIONS, ...(task.captureActions ?? [])],
        ...(sessionOwned ? { sessionOwned: true } : {}),
        ...(sessionOwned && space.spaceId === undefined ? { sessionCreated: true } : {}),
      };
      attached.set(task.id, entry);
      publish(browsers());
      return browser(task.id, entry);
    },
    async close() { throw new Error('Use mearl browser_control --browser <browserId> --payload \'{"operation":"finish"}\' to finish this task'); },
    async control({ browserId, operation, tabId, keepTabIds }, context) {
      const id = spaceId(browserId);
      if (tabId !== undefined) throw new Error('Ego control applies to the entire Space; omit tabId');
      if (keepTabIds?.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('Ego keepTabIds must be positive integer page IDs');
      await bridge.control(operation, { spaceId: id, ...(operation === 'finish' ? { keep: (keepTabIds ?? []).map(id => `p${id}`) } : {}) }, context.deadline);
      if (operation === 'finish') {
        attached.delete(id);
        publish(browsers());
      }
      return { controlSessionMode: 'external', operation, control: operation === 'handoff' ? 'user' : operation === 'resume' ? 'agent' : 'finished' };
    },
    async detach({ browserId }) {
      const id = spaceId(browserId);
      await bridge.request('release', { spaceId: id });
      attached.delete(id);
      publish(browsers());
      return { detached: true };
    },
    async getEnhancementTarget({ browserId, tabId }, context) {
      try { return await bridge.request('target', { spaceId: spaceId(browserId), tabId }, context.deadline); }
      catch (error) {
        if (isUserInControl(error) || /EGO_TASK_SPACE_INACTIVE/i.test(String(error))) return { tabId, ready: false };
        throw error;
      }
    },
    async handleAction({ browserId, action, data, deadline }) {
      if (browserId === 'local' && action === 'get_capabilities')
        return describeBrowserCapabilities(['get_capabilities'], undefined, data);
      const id = spaceId(browserId);
      const { actions } = attached.get(id)!;
      const resources = createProviderAppResourceClient('ego', browserId);
      if (action === 'get_capabilities') {
        const { catalog } = await resources.catalog(data, deadline);
        const result = describeBrowserCapabilities(actions, { apps: catalog }, data);
        result.limitations.push('Ego native control governs page operations. Host services require installed capabilities and real authorization still requires the user to approve on their device.');
        return result;
      }
      try { return await bridge.request('action', { spaceId: id, action, payload: data }, deadline); }
      catch (error) {
        if (isUserInControl(error))
          throw new Error('EXTERNAL_CONTROL_PAUSED: the Ego Space is controlled by the user', { cause: error });
        throw error;
      }
    },
  };
}
