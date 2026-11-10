import { createProviderServer, type ProviderBrowser } from '@mearl/provider';
import { EgoBridge } from './bridge.js';
import { createEgoProvider } from './provider.js';

const bridge = new EgoBridge();
let publishedBrowsers = '';
const publish = (browsers: ProviderBrowser[]) => {
  const signature = JSON.stringify(browsers);
  if (signature === publishedBrowsers) return;
  server.updateBrowsers(browsers);
  publishedBrowsers = signature;
};
const definition = createEgoProvider(bridge, publish);
const server = createProviderServer({ definition });
let stopping = false;
let polling = false;
await server.start();
const timer = setInterval(async () => {
  if (stopping || polling) return;
  polling = true;
  try {
    const browsers = await definition.listBrowsers!({});
    if (!stopping) publish(browsers);
  }
  catch (error) { if (!stopping) { console.error(String(error)); publish([]); } }
  finally { polling = false; }
}, 2000);
timer.unref();
async function stop() {
  if (stopping) return;
  stopping = true; clearInterval(timer); bridge.close(); await server.stop();
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
