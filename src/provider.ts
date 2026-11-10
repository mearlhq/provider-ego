import { readFileSync } from 'node:fs';
import { createProviderAppResourceClient, type BrowserProviderDefinition, type ProviderAction, type ProviderBrowser } from '@mearl/provider';
import { EgoBridge } from './bridge.js';
import { describeBrowserCapabilities } from '@mearl/browser-core';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const ACTIONS: ProviderAction[] = ['tab_list', 'tab_open', 'tab_close', 'page_navigate', 'page_snapshot', 'page_eval', 'page_click', 'page_type', 'page_press', 'page_scroll', 'page_hover', 'page_wait', 'page_frames', 'page_screenshot', 'page_upload', 'set_timezone', 'set_device_emulation', 'set_app_profile', 'get_capabilities'];

export function createEgoProvider(bridge = new EgoBridge(), publish: (browsers: ProviderBrowser[]) => void = () => {}): BrowserProviderDefinition {
  const attached = new Map<number, { name: string }>();
  const spaceId = (id: string): number => {
    if (!/^space-\d+$/.test(id) || !attached.has(Number(id.slice(6)))) throw new Error('Ego Space is not attached to this Provider');
    return Number(id.slice(6));
  };
  const browser = (id: number, name: string): ProviderBrowser => ({
    browserId: `space-${id}`, name, status: 'connected', ownership: 'attached', persistence: 'persistent',
    control: { kind: 'provider', capabilities: { actions: ACTIONS, screenshot: 'native', controlSessionMode: 'external' } },
    operations: ['detach', 'handoff', 'resume', 'finish'], references: [{ kind: 'space', id: String(id), label: 'Ego Space' }], details: { spaceId: id },
  });
  return {
    descriptor: { providerId: 'ego', name: 'Ego Lite', version: pkg.version, protocolVersion: 3 },
    browserType: pkg.mearl.provider.browserType,
    async listBrowsers() {
      if (!attached.size) return [];
      const spaces = await bridge.request('list');
      return [...attached].flatMap(([id, value]) => {
        const space = spaces.find((s: any) => s.id === id);
        if (!space || !['agent', 'agentDelegatedToUser'].includes(space.ownership)) { attached.delete(id); return []; }
        return [browser(id, value.name)];
      });
    },
    async launch(options, context) {
      const task = await bridge.request('launch', options, context.deadline);
      attached.set(task.id, { name: task.name });
      publish([...attached].map(([id, value]) => browser(id, value.name)));
      return browser(task.id, task.name);
    },
    async close() { throw new Error('Use mearl browser_control --browser <browserId> --payload \'{"operation":"finish"}\' to finish this task'); },
    async control({ browserId, operation, tabId, keepTabIds }, context) {
      const id = spaceId(browserId);
      if (tabId !== undefined) throw new Error('Ego control applies to the entire Space; omit tabId');
      if (keepTabIds?.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('Ego keepTabIds must be positive integer page IDs');
      await bridge.control(operation, { spaceId: id, ...(operation === 'finish' ? { keep: (keepTabIds ?? []).map(id => `p${id}`) } : {}) }, context.deadline);
      if (operation === 'finish') {
        attached.delete(id);
        publish([...attached].map(([space, value]) => browser(space, value.name)));
      }
      return { controlSessionMode: 'external', operation, control: operation === 'handoff' ? 'user' : operation === 'resume' ? 'agent' : 'finished' };
    },
    async detach({ browserId }) {
      const id = spaceId(browserId);
      await bridge.request('release', { spaceId: id });
      attached.delete(id);
      publish([...attached].map(([id, value]) => browser(id, value.name)));
      return { detached: true };
    },
    async getEnhancementTarget({ browserId, tabId }, context) {
      try { return await bridge.request('target', { spaceId: spaceId(browserId), tabId }, context.deadline); }
      catch (error) {
        if (/EGO_TASK_SPACE_USER_IN_CONTROL|EGO_TASK_SPACE_INACTIVE|user control/i.test(String(error))) return { tabId, ready: false };
        throw error;
      }
    },
    async handleAction({ browserId, action, data, deadline }) {
      const id = spaceId(browserId);
      const resources = createProviderAppResourceClient('ego', browserId);
      if (action === 'get_capabilities') {
        const { catalog } = await resources.catalog(data, deadline);
        const result = describeBrowserCapabilities(ACTIONS, { apps: catalog }, data);
        result.limitations.push('Ego native control governs page operations. Host services require installed capabilities and real authorization still requires the user to approve on their device.');
        return result;
      }
      return bridge.request('action', { spaceId: id, action, payload: data }, deadline);
    },
  };
}
