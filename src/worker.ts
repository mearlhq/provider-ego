import { createInterface } from 'node:readline';
import { createConnection } from 'node:net';
import { nativePage, disposeNativePages } from './native-page.js';

const sdk = globalThis as any;
export const tabIdOf = (label: string): number => {
  if (!/^p[1-9]\d*$/.test(label)) throw new Error('Unsupported Ego Page label');
  const id = Number(label.slice(1));
  if (!Number.isSafeInteger(id)) throw new Error('Invalid Page ID');
  return id;
};
function pageFor(task: any, tabId: number) {
  if (!Number.isSafeInteger(tabId) || tabId < 1) throw new Error('Invalid tabId');
  return task.page(`p${tabId}`);
}

export async function dispatch(operation: string, data: any): Promise<any> {
  if (operation === 'list') return sdk.listTaskSpaces();
  if (operation === 'release') { await disposeNativePages(data.spaceId); return { detached: true }; }
  if (operation === 'launch') {
    if ((data.spaceId === undefined) === (data.name === undefined)) throw new Error('Specify exactly one of name or spaceId');
    const task = await sdk.taskSpace(data.spaceId ?? data.name);
    return { id: task.spaceId, name: task.name, ownership: task.ownership };
  }
  if (operation === 'resume') {
    const task = await sdk.takeOverTaskSpace(data.spaceId);
    return { spaceId: task.spaceId, control: 'agent' };
  }
  const task = await sdk.taskSpace(data.spaceId);
  if (operation === 'handoff') { await task.handOff(); return { spaceId: task.spaceId, control: 'user' }; }
  if (operation === 'finish') {
    // Dispose only after Ego finishes: a failed/user-blocked finish must retain its pages.
    await task.finish({ keep: data.keep ?? [] });
    if (!(data.keep?.length)) await disposeNativePages(data.spaceId);
    return { finished: true };
  }
  if (operation === 'tabs' || (operation === 'action' && data.action === 'tab_list')) {
    return { tabs: (await task.tabs()).filter((tab: any) => tab.label).map((tab: any) => ({
      tabId: tabIdOf(tab.label), title: tab.title, url: tab.url, active: tab.active, label: tab.label,
    })) };
  }
  if (operation === 'target') {
    const page = pageFor(task, data.tabId);
    const tree = await page.cdp('Page.getFrameTree');
    return { tabId: data.tabId, ready: true, mainFrameId: tree.frameTree.frame.id, url: tree.frameTree.frame.url };
  }
  if (operation !== 'action') throw new Error(`Unknown operation ${operation}`);
  const { action, payload: p } = data;
  if (action === 'tab_open') {
    for (const option of ['group', 'openerTabId', 'closeExisting', 'restoreFocusOnClose', 'match'])
      if (p[option] !== undefined) throw new Error(`Unsupported Ego tab option: ${option}`);
    if (p.reuse && p.reuse !== 'never') throw new Error('Use tab_list and page_navigate for explicit reuse');
    const pages = await task.pages();
    const blank = ['about:blank', 'chrome://new-tab-page/', 'chrome://newtab/'];
    const page = pages.length === 1 && blank.includes(await pages[0].url()) && pages[0].openedBy === 'agent' ? pages[0] : await task.newPage();
    const tabId = tabIdOf(page.label);
    if (p.emulation || p.appProfile) {
      const host = await nativePage(data.spaceId, tabId, page, task);
      if (p.appProfile) await host.invoke('set_app_profile', { enabled: true, profile: p.appProfile, os: p.os, bridgeConfig: p.bridgeConfig, ...(p.emulation ? { emulation: p.emulation } : {}), reload: false });
      else await host.invoke('set_device_emulation', { ...p.emulation, enabled: true, reload: false });
      await host.invoke('page_navigate', { url: p.url });
    } else await page.goto(p.url);
    return { tabId, url: await page.url(), title: await page.title() };
  }
  const page = pageFor(task, p.tabId);
  if (action === 'tab_close') {
    await page.close(); await disposeNativePages(data.spaceId, p.tabId); return { closed: true };
  }
  const host = await nativePage(data.spaceId, p.tabId, page, task);
  return host.invoke(action, p);
}

export async function runWorker(port: number, token: string) {
  const socket = createConnection({ port, host: '127.0.0.1' });
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  socket.write(JSON.stringify({ token }) + '\n');
  const lines = createInterface({ input: socket });
  try { for await (const line of lines) {
    let request: any;
    try {
      request = JSON.parse(line);
      if (Date.now() >= request.deadline) throw new Error('Request expired before dispatch');
      const result = await dispatch(request.operation, request.data);
      socket.write(JSON.stringify({ id: request.id, result }) + '\n');
    } catch (error) {
      socket.write(JSON.stringify({ id: request?.id, error: error instanceof Error ? error.message : String(error) }) + '\n');
    }
  } } finally { await disposeNativePages(); }
}
