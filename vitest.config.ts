import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const host = resolve('.cache/native-host/package/dist/external-page-host.js');
export default defineConfig({
  resolve: { alias: existsSync(host) ? { '@mearl/native-host/external-page-host': host } : {} },
});
