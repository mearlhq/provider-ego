import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEgoExecutable } from './executable.js';

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function home() {
  const directory = mkdtempSync(join(tmpdir(), 'ego-executable-'));
  directories.push(directory);
  vi.stubEnv('HOME', directory);
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
  vi.stubEnv('PATH', '/nonexistent-ego-path');
  return directory;
}
function executable(directory: string) {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'ego-browser');
  writeFileSync(file, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return file;
}
it('finds the onboarding installation without shell PATH configuration', () => {
  const directory = home();
  const file = executable(join(directory, '.local/bin'));
  expect(resolveEgoExecutable()).toBe(file);
});
it('prefers PATH and handles directories with spaces', () => {
  const directory = home();
  executable(join(directory, '.local/bin'));
  const bin = join(directory, 'custom bin');
  const file = executable(bin);
  vi.stubEnv('PATH', bin);
  expect(resolveEgoExecutable()).toBe(file);
});
it('reports a missing installation and resolves again after onboarding', () => {
  const directory = home();
  expect(() => resolveEgoExecutable()).toThrow('EGO_EXECUTABLE_NOT_FOUND');
  const file = executable(join(directory, '.local/bin'));
  expect(resolveEgoExecutable()).toBe(file);
});
