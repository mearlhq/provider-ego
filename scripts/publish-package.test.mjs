import { it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { publishPackage } from './publish-package.mjs';

it.each(['matching', 'conflicting', 'missing', 'unauthorized'])('handles %s registry state without replacing a release', state => {
  const dir = mkdtempSync(join(tmpdir(), 'ego-publish-'));
  const archive = join(dir, 'provider.tgz');
  writeFileSync(archive, 'fixture');
  const integrity = 'sha512-' + createHash('sha512').update('fixture').digest('base64');
  const run = vi.fn().mockReturnValueOnce({
    status: ['matching', 'conflicting'].includes(state) ? 0 : 1,
    stdout: JSON.stringify(state === 'matching' ? integrity : state === 'conflicting' ? 'different' : { error: { code: state === 'missing' ? 'E404' : 'E401' } }),
    stderr: 'registry failure',
  }).mockReturnValue({ status: 0 });
  try {
    const invoke = () => publishPackage(relative(process.cwd(), archive), { name: '@example/provider', version: '1.0.0' }, run);
    if (state === 'conflicting' || state === 'unauthorized') expect(invoke).toThrow();
    else expect(invoke()).toBe(state === 'matching' ? 'already-published' : 'published');
    expect(run).toHaveBeenCalledTimes(state === 'missing' ? 2 : 1);
    if (state === 'missing') expect(run.mock.calls[1][1]).toEqual(['publish', archive, '--access', 'public', '--tag', 'latest', '--registry=https://registry.npmjs.org/']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
