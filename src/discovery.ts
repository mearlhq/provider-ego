import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveEgoExecutable } from './executable.js';

const exec = promisify(execFile);

/** The CLI can start Ego, so discovery observes the browser process first. */
export async function discoverEgoBrowser(): Promise<{ pid?: number; connected: boolean } | undefined> {
  let pids: number[];
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,comm='], { timeout: 2000 });
      pids = parseMacBrowserPids(stdout);
    } else if (process.platform === 'win32') {
      const { stdout } = await exec('tasklist.exe', ['/FO', 'CSV', '/NH'], { timeout: 3000, windowsHide: true });
      pids = [...stdout.matchAll(/^"ego(?: lite)?\.exe","(\d+)"/gim)].map(match => Number(match[1]));
    } else return;
  } catch {
    return;
  }
  if (!pids.length) return;
  const pid = pids.length === 1 ? pids[0] : undefined;
  try {
    resolveEgoExecutable();
    return { pid, connected: true };
  } catch {
    return { pid, connected: false };
  }
}

export function parseMacBrowserPids(processes: string): number[] {
  return [...processes.matchAll(/^\s*(\d+)\s+\/[^\r\n]+\/ego lite\.app\/Contents\/MacOS\/ego lite\s*$/gim)]
    .map(match => Number(match[1]));
}
