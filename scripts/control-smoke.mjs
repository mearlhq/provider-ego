import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createProviderRuntime } from '@mearl/provider';
import { createEgoProvider } from '../dist/provider.js';
import { EgoBridge } from '../dist/bridge.js';
const http = createServer((_req, res) => res.end('<title>Control test</title><p id="ready">Ready</p>'));
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const bridge = new EgoBridge();
const runtime = createProviderRuntime(createEgoProvider(bridge));
let browserId;
try {
  ({ browserId } = await runtime.launch({ name: 'Unified control validation' }));
  const action = (action, data) => runtime.invokeAction({ browserId, action, data, deadline: Date.now() + 25000 });
  const { tabId } = await action('tab_open', { url: `http://127.0.0.1:${http.address().port}/` });
  assert.ok((await action('page_snapshot', { tabId })).snapshot.includes('Ready'));
  let settled = false;
  const pending = action('page_wait', { tabId, condition: 'false', timeout: 10000 }).then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 750));
  assert.equal(settled, false, 'page operation must be pending');
  const started = Date.now();
  assert.equal((await runtime.control({ browserId, operation: 'handoff' })).control, 'user');
  console.log('handoff during pending page operation:', Date.now() - started, 'ms');
  assert.ok(Date.now() - started < 7000, 'handoff must bypass page queue');
  await pending;
  await assert.rejects(action('page_eval', { tabId, expression: 'document.body.dataset.unsafe="yes"' }), /user|control|handed|EGO_TASK_SPACE/i);
  // Only resumes the isolated fixture this script handed off.
  assert.equal((await runtime.control({ browserId, operation: 'resume' })).control, 'agent');
  assert.equal((await action('page_eval', { tabId, expression: 'document.body.dataset.unsafe ?? null' })).result, null);
  await assert.rejects(runtime.control({ browserId, operation: 'finish', keepTabIds: [999999999] }), /belong/);
  assert.equal((await runtime.control({ browserId, operation: 'finish' })).control, 'finished');
  assert.ok(!(await runtime.listBrowsers()).some(b => b.browserId === browserId));
  browserId = undefined;
  console.log('PASS: runtime lifecycle, pending action handoff, denied write, resume, finish and retention validation');
} finally {
  if (browserId) console.error('Fixture retained for diagnosis:', browserId);
  bridge.close(); http.closeAllConnections(); http.close();
}
