import { build } from 'esbuild';
import { mkdirSync, writeFileSync, existsSync, rmSync, copyFileSync, appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
const nativeRequire = createRequire(import.meta.resolve('@mearl/native-host'));
const archive = process.env.MEARL_EGO_NATIVE_HOST_PACKAGE;
const cache = resolve('.cache/native-host');
if (archive) {
  rmSync(cache, { recursive: true, force: true });
  mkdirSync(cache, { recursive: true });
  execFileSync('tar', ['-xzf', resolve(archive), '-C', cache]);
}
const localHost = resolve(cache, 'package/dist/external-page-host.js');
const overrides = existsSync(localHost) ? {
  '@mearl/native-host/external-page-host': [resolve(cache, 'package/dist/external-page-host.d.ts')],
} : undefined;
mkdirSync('.cache', { recursive: true });
writeFileSync('.cache/tsconfig.json', JSON.stringify({ extends: '../tsconfig.json', compilerOptions: overrides ? { paths: overrides } : {} }));
if (!process.argv.includes('--typecheck')) rmSync('dist', { recursive: true, force: true });
execFileSync(resolve('node_modules/.bin/tsc'), ['-p', '.cache/tsconfig.json', ...(process.argv.includes('--typecheck') ? ['--noEmit'] : [])], { stdio: 'inherit' });
if (process.argv.includes('--typecheck')) process.exit(0);
// Bundle the public native page host so installation needs no second browser host process.
await build({ entryPoints: ['src/worker.ts'], outfile: 'dist/worker.js', bundle: true,
  platform: 'node', format: 'esm', target: 'node22', packages: 'bundle',
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  alias: { ws: nativeRequire.resolve('ws'), ...(existsSync(localHost) ? { '@mearl/native-host/external-page-host': localHost } : {}) },
});
copyFileSync(existsSync(localHost) ? resolve(cache, 'package/dist/THIRD_PARTY_NOTICES.txt') : nativeRequire.resolve('./THIRD_PARTY_NOTICES.txt'), 'dist/THIRD_PARTY_NOTICES.txt');
appendFileSync('dist/THIRD_PARTY_NOTICES.txt', '\n\nws\n\n' + readFileSync(resolve(dirname(nativeRequire.resolve('ws/package.json')), 'LICENSE'), 'utf8'));
for (const file of ['dist/native-page.js', 'dist/native-page.d.ts']) rmSync(file, { force: true });
