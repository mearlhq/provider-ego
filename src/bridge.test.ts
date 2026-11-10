import { beforeEach, expect, it, vi } from 'vitest';
import { EgoBridge } from './bridge.js';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof childProcess>();
  return { ...original, spawn: vi.fn(original.spawn) };
});

// Exercise the actual socket handshake with a child that speaks the worker protocol.
const { spawn } = await vi.importActual<typeof childProcess>('node:child_process');
beforeEach(() => { vi.mocked(childProcess.spawn).mockReset(); });
function worker(_file: any, args: any) {
  const [, port, token] = args[2].match(/m\.runWorker\((\d+),"([^"]+)"/);
  return spawn(process.execPath, ['--input-type=module', '-e', `
    import { connect } from 'node:net';
    import { createInterface } from 'node:readline';
    const socket = connect(${port}, '127.0.0.1', () => socket.write(JSON.stringify({token:${JSON.stringify(token)}})+'\\n'));
    createInterface({input:socket}).on('line', line => {
      const request = JSON.parse(line);
      if (request.operation === 'disconnect') process.exit(1);
      if (request.operation === 'hang') return;
      socket.write(JSON.stringify({id:request.id,result:request.operation})+'\\n');
    });
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
}

it('recovers on a later request after spawn fails, sharing concurrent startup', async () => {
  const bridge = new EgoBridge('/test/ego-browser');
  const failedChild = Object.assign(new EventEmitter(), { kill: vi.fn() });
  const mocked = vi.spyOn(childProcess, 'spawn').mockImplementationOnce(() => {
    queueMicrotask(() => failedChild.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
    return failedChild as any;
  }).mockImplementation(worker as any);
  try {
    const results = await Promise.allSettled([bridge.request('first'), bridge.request('second')]);
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(mocked).toHaveBeenCalledTimes(1);
    const retry = bridge.request('retry');
    // The failed child can report exit after the next startup has begun.
    failedChild.emit('exit', 1);
    await expect(retry).resolves.toBe('retry');
    expect(mocked).toHaveBeenCalledTimes(2);
  } finally { bridge.close(); vi.restoreAllMocks(); }
});

it.each(['disconnect', 'hang'])('does not retry after a dispatched request %s', async operation => {
  const mocked = vi.spyOn(childProcess, 'spawn').mockImplementation(worker as any);
  const bridge = new EgoBridge('/test/ego-browser');
  try {
    await expect(bridge.request('ready')).resolves.toBe('ready');
    await expect(bridge.request(operation, {}, Date.now() + 100)).rejects.toThrow(/EGO_CONNECTION_LOST|EGO_REQUEST_TIMEOUT/);
    await expect(bridge.request('retry')).rejects.toThrow('EGO_CONNECTION_LOST');
    expect(mocked).toHaveBeenCalledTimes(1);
  } finally { bridge.close(); vi.restoreAllMocks(); }
});

it('uses a short-lived independent control channel and closes it on failure', async () => {
  const pageChannel = new EgoBridge();
  const request = vi.spyOn(EgoBridge.prototype, 'request').mockRejectedValue(new Error('user still controls the task'));
  const close = vi.spyOn(EgoBridge.prototype, 'close').mockImplementation(() => {});
  try {
    await expect(pageChannel.control('resume', { spaceId: 7 }, 123)).rejects.toThrow('user still controls');
    expect(request.mock.instances[0]).not.toBe(pageChannel);
    expect(request).toHaveBeenCalledWith('resume', { spaceId: 7 }, 123);
    expect(close.mock.instances[0]).toBe(request.mock.instances[0]);
    expect(close).toHaveBeenCalledOnce();
  } finally { vi.restoreAllMocks(); }
});
