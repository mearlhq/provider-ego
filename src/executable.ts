import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

/** Desktop hosts may inherit PATH before Ego's onboarding updates the shell. */
export function resolveEgoExecutable(): string {
  const windows = process.platform === 'win32';
  const path = windows ? win32 : posix;
  const filename = windows ? 'ego-browser.exe' : 'ego-browser';
  const candidates = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
    .map(directory => path.join(directory, filename));
  if (process.platform === 'darwin') candidates.push(path.join(homedir(), '.local', 'bin', filename));
  if (windows) candidates.push(path.join(homedir(), '.local', 'share', 'ego', 'active_version_dir', filename));
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); if (statSync(candidate).isFile()) return candidate; }
    catch { /* Try the next installed location. */ }
  }
  throw new Error(`EGO_EXECUTABLE_NOT_FOUND: complete Ego Lite onboarding and make ${filename} available on PATH or in Ego's standard user installation; then retry`);
}
