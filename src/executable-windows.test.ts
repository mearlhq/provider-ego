import { afterEach, expect, it, vi } from 'vitest';
import { accessSync, statSync } from 'node:fs';
import { resolveEgoExecutable } from './executable.js';

vi.mock('node:os', () => ({ homedir: () => 'C:\\Users\\Example User' }));
vi.mock('node:fs', () => ({ accessSync: vi.fn(), statSync: vi.fn(), constants: { X_OK: 1 } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const installed = 'C:\\Users\\Example User\\.local\\share\\ego\\active_version_dir\\ego-browser.exe';
it.each([true, false])('resolves the Windows executable with PATH available=%s', onPath => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  vi.stubEnv('PATH', 'C:\\Windows\\System32;D:\\Ego Tools');
  const expected = onPath ? 'D:\\Ego Tools\\ego-browser.exe' : installed;
  const checked: string[] = [];
  vi.mocked(accessSync).mockImplementation(file => {
    checked.push(String(file));
    if (file !== expected) throw new Error('ENOENT');
  });
  vi.mocked(statSync).mockReturnValue({ isFile: () => true } as any);
  expect(resolveEgoExecutable()).toBe(expected);
  expect(checked).toEqual(onPath
    ? ['C:\\Windows\\System32\\ego-browser.exe', expected]
    : ['C:\\Windows\\System32\\ego-browser.exe', 'D:\\Ego Tools\\ego-browser.exe', installed]);
});
