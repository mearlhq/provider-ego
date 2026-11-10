import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { EgoBridge } from '../dist/bridge.js';

const profile = process.env.MEARL_EGO_TEST_APP;
const runtimeExpression = process.env.MEARL_EGO_TEST_RUNTIME;
const userAgentMarker = process.env.MEARL_EGO_TEST_UA;
if (!profile || !runtimeExpression || !userAgentMarker) {
  throw new Error('Set MEARL_EGO_TEST_APP, MEARL_EGO_TEST_RUNTIME (a boolean page expression), and MEARL_EGO_TEST_UA (a UA substring) for an installed App profile.');
}

const http = createServer((_request, response) => response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ego Provider fixture</title><input id="name"><button id="increment" onclick="document.getElementById('count').textContent=Number(document.getElementById('count').textContent)+1">Increment</button><output id="count">0</output>`));
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const bridge = new EgoBridge();
let spaceId;
try {
  const task = await bridge.request('launch', { name: 'Mearl Ego Provider validation' });
  spaceId = task.id;
  console.log({ spaceId });
  const action = (action, payload) => bridge.request('action', { spaceId, action, payload });
  const tab = await action('tab_open', { url: `http://127.0.0.1:${http.address().port}/` });
  const tabId = tab.tabId;
  const evaluate = async expression => (await action('page_eval', { tabId, expression })).result;
  const snapshot = await action('page_snapshot', { tabId, mode: 'viewport' });
  assert.match(snapshot.snapshot, /Increment/);
  const frames = await action('page_frames', { tabId });
  assert.equal(frames.frames.filter(frame => frame.isMainFrame).length, 1);
  await action('page_type', { tabId, selector: '#name', text: 'Mearl' });
  await action('page_click', { tabId, selector: '#increment' });
  assert.equal(await evaluate('document.querySelector("#name").value'), 'Mearl');
  assert.equal(await evaluate('document.querySelector("#count").textContent'), '1');
  console.log('page operations passed');
  await bridge.request('handoff', { spaceId });
  await assert.rejects(action('page_eval', { tabId, expression: 'document.body.dataset.unsafe="yes"' }), /user|control|handed|EGO_TASK_SPACE/i);
  console.log('native handoff blocked writes');
  // This test itself handed off its isolated fixture; no user workflow is resumed.
  await bridge.request('resume', { spaceId });
  assert.equal(await evaluate('document.body.dataset.unsafe ?? null'), null);
  await action('set_device_emulation', { tabId, enabled: true, preset: 'iphone-17-pro' });
  await action('page_wait', { tabId, selector: '#increment' });
  const device = await evaluate('({width:innerWidth,dpr:devicePixelRatio,touch:navigator.maxTouchPoints,ua:navigator.userAgent})');
  console.log({ device });
  assert.equal(device.width, 402);
  assert.ok(device.touch > 0);
  await action('page_click', { tabId, selector: '#increment' });
  assert.equal(await evaluate('document.querySelector("#count").textContent'), '1');
  await action('page_screenshot', { tabId });
  console.log('device screenshot passed');
  await action('set_app_profile', { tabId, enabled: true, profile, emulation: { preset: 'iphone-17-pro', deviceShell: true } });
  await action('page_wait', { tabId, condition: runtimeExpression });
  assert.ok((await evaluate('navigator.userAgent')).includes(userAgentMarker));
  assert.ok((await action('page_frames', { tabId })).frames.length >= 2);
  await action('page_screenshot', { tabId });
  console.log('device shell screenshot passed');
  await action('page_navigate', { tabId, url: `http://localhost:${http.address().port}/next` });
  await action('page_wait', { tabId, condition: runtimeExpression });
  assert.equal(await evaluate('innerWidth'), device.width);
  assert.equal(await evaluate('location.hostname'), 'localhost');
  await action('page_click', { tabId, selector: '#increment' });
  assert.equal(await evaluate('document.querySelector("#count").textContent'), '1');
  console.log('root WebView navigation passed');
  const screenshot = await action('page_screenshot', { tabId });
  assert.ok(screenshot.data.length > 100);
  await writeFile('/tmp/mearl-ego-provider-smoke.png', Buffer.from(screenshot.data, 'base64'));
  console.log('App runtime, navigation and screenshot passed');
  await action('set_app_profile', { tabId, enabled: false });
  await action('page_wait', { tabId, selector: '#increment' });
  assert.equal(await evaluate(`Boolean(${runtimeExpression})`), false);
  assert.equal(await evaluate('innerWidth'), device.width);
  await action('set_device_emulation', { tabId, enabled: false });
  await action('page_wait', { tabId, selector: '#increment' });
  assert.equal(await evaluate('navigator.maxTouchPoints'), 0);
  await bridge.request('finish', { spaceId, keep: [] });
  assert.ok(!(await bridge.request('list')).some(s => s.id === spaceId));
  spaceId = undefined;
  console.log('PASS: extension-free page, control, device, App and cleanup smoke');
} finally {
  if (spaceId !== undefined) console.error(`Fixture Space ${spaceId} retained for diagnosis`);
  bridge.close(); http.closeAllConnections(); http.close();
}
