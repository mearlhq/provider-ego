import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { resolveEgoExecutable } from './executable.js';

/** Ego launches its own Node process; a private loopback channel keeps CDP sessions alive. */
export class EgoBridge {
  private child?: ChildProcess;
  private server?: Server;
  private socket?: Socket;
  private startup?: Promise<void>;
  private failed = false;
  private closed = false;
  private pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  constructor(private executable?: string) {}

  /** Lifecycle control must not wait behind a page action awaiting human input. */
  async control(operation: 'handoff' | 'resume' | 'finish', data: any, deadline?: number): Promise<any> {
    const channel = new EgoBridge(this.executable);
    try { return await channel.request(operation, data, deadline); }
    finally { channel.close(); }
  }

  private start(): Promise<void> {
    if (this.startup) return this.startup;
    let ready = false;
    return this.startup = new Promise<void>((resolve, reject) => {
      let ended = false;
      const fail = (error: Error) => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        this.fail(error);
        reject(error);
      };
      const token = randomUUID();
      const server = this.server = createServer(socket => {
        if (ended || this.closed) { socket.destroy(); return; }
        socket.setTimeout(5000, () => socket.destroy());
        let authenticated = false;
        const lines = createInterface({ input: socket });
        lines.on('line', line => {
          if (ended || this.closed) { socket.destroy(); return; }
          try {
            const reply = JSON.parse(line);
            if (!authenticated) {
              if (reply.token !== token || this.socket) { socket.destroy(); return; }
              authenticated = true; socket.setTimeout(0); this.socket = socket;
              ready = true; clearTimeout(timer); server.close(); resolve(); return;
            }
            const pending = this.pending.get(reply.id);
            if (!pending) return;
            this.pending.delete(reply.id); clearTimeout(pending.timer);
            if (reply.error) pending.reject(new Error(reply.error)); else pending.resolve(reply.result);
          } catch { socket.destroy(); }
        });
        socket.on('error', error => { if (authenticated) fail(error); });
        socket.on('close', () => { if (authenticated) fail(new Error('EGO_CONNECTION_LOST: effects may be unconfirmed')); });
      });
      const timer = setTimeout(() => fail(new Error('Ego bridge startup timed out')), 15_000);
      server.on('error', fail);
      server.listen(0, '127.0.0.1', () => {
        if (ended || this.closed) return;
        const address = server.address();
        if (!address || typeof address === 'string') return;
        const entry = new URL('./worker.js', import.meta.url).href;
        try {
          this.child = spawn(this.executable ?? resolveEgoExecutable(), ['nodejs', '-e', `await import(${JSON.stringify(entry)}).then(m => m.runWorker(${address.port},${JSON.stringify(token)}));`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        } catch (error) { fail(error as Error); return; }
        this.child.stderr?.on('data', chunk => process.stderr.write(chunk));
        this.child.stdout?.on('data', chunk => process.stderr.write(chunk));
        this.child.on('error', fail);
        this.child.on('exit', () => {
          const error = new Error('EGO_CONNECTION_LOST: dispatched effects may be unconfirmed');
          fail(error);
        });
      });
    }).catch(error => {
      // No request can have been dispatched before authentication. A later call
      // may retry startup after installation; never replay an in-flight action.
      if (!ready && !this.closed) {
        this.failed = false;
        this.startup = undefined;
        this.child = undefined;
        this.server = undefined;
        this.socket = undefined;
      }
      throw error;
    });
  }

  async request(operation: string, data: any = {}, deadline = Date.now() + 60_000): Promise<any> {
    if (this.failed) throw new Error('EGO_CONNECTION_LOST: restart the Provider and verify page/environment state');
    if (!Number.isSafeInteger(deadline) || deadline <= Date.now()) throw new Error('Request deadline exceeded');
    await this.start();
    if (this.failed) throw new Error('EGO_CONNECTION_LOST: restart the Provider and verify page/environment state');
    const remaining = deadline - Date.now();
    if (remaining <= 0 || remaining > 2_147_483_647) throw new Error('Request deadline exceeded');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('EGO_REQUEST_TIMEOUT: effects unconfirmed; no automatic retry')), remaining);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.write(JSON.stringify({ id, operation, data, deadline }) + '\n');
    });
  }
  private fail(error: Error) {
    if (this.failed) return;
    this.failed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear(); this.socket?.destroy(); this.server?.close(); this.child?.kill();
  }
  close() { this.closed = true; this.fail(new Error('Ego bridge closed')); }
}
