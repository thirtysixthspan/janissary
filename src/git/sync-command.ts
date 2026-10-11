import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const SYNC_COMMAND_TIMEOUT_MS = 60_000;
export const SYNC_CANCEL_REASON = 'Git sync was stopped.';

export type SyncCommandOptions = { signal?: AbortSignal; timeout?: number };

export class SyncCommandRunner {
  private controller = new AbortController();
  private disposed = false;

  get signal(): AbortSignal { return this.controller.signal; }
  get isDisposed(): boolean { return this.disposed; }

  async run(args: string[], cwd: string, env?: NodeJS.ProcessEnv, options: SyncCommandOptions = {}): Promise<string> {
    if (this.disposed) throw new Error(SYNC_CANCEL_REASON);
    const signal = options.signal ?? this.controller.signal;
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      ...(env && { env }),
      signal,
      timeout: options.timeout ?? SYNC_COMMAND_TIMEOUT_MS,
      killSignal: 'SIGTERM',
    });
    return stdout;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort(new Error(SYNC_CANCEL_REASON));
  }
}

export function isExpectedDiffChange(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error.code === 1 || error.code === '1');
}
