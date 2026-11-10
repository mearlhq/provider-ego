import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function publishPackage(archive, manifest, run = spawnSync) {
  const integrity = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64');
  const result = run('npm', ['view', `${manifest.name}@${manifest.version}`, 'dist.integrity', '--json', '--registry=https://registry.npmjs.org/'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  let response;
  try { response = JSON.parse(result.stdout); } catch { throw new Error(result.stderr || 'Invalid npm registry response'); }
  if (result.status === 0) {
    if (response !== integrity) throw new Error('Published package integrity differs; refusing to replace it');
    return 'already-published';
  }
  if (response?.error?.code !== 'E404') throw new Error(result.stderr || 'npm registry lookup failed');
  const published = run('npm', ['publish', archive, '--access', 'public', '--tag', 'latest', '--registry=https://registry.npmjs.org/'], { stdio: 'inherit' });
  if (published.error) throw published.error;
  if (published.status !== 0) throw new Error('npm publication failed');
  return 'published';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(publishPackage(process.argv[2], manifest));
}
