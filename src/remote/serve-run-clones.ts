import { existsSync } from 'node:fs';
import { errorText } from '../error-text.js';
import { sameLaunchName } from '../launch-name/check.js';
import { invalidNameRefusal } from '../launch-name/messages.js';
import type { ProjectTokens } from '../project/tokens.js';
import { AGENT_CLONE_DEPTH, workspaceCloneOptions } from '../workspace/clone-depth.js';
import { workspacePath, workspaceTempPath } from '../workspace/index.js';
import { workspaceLabelError } from '../workspace/label.js';
import type { ProvisioningWorkspace, WorkspaceManager } from '../workspace/manager.js';

// A run clone's directory is published only once its clone and post-clone setup have settled. The
// service owns each entry from reservation through readiness to release; the manager owns the
// directories themselves and removes them best effort, exactly as it does for the main workspace.
export type RemoteRunCloneResult = { dir?: string; error?: string };

type Phase = 'queued' | 'creating' | 'ready' | 'releasing';

type LifecycleEntry = {
  label: string;
  key: string;
  dir: string;
  phase: Phase;
  cancelRequested: boolean;
  cancelApplied: boolean;
  handle: ProvisioningWorkspace | undefined;
  readiness: Promise<void> | undefined;
  cleanup: Promise<void> | undefined;
  done: PromiseWithResolvers<RemoteRunCloneResult>;
};

const alreadyExists = (label: string): string => `Remote run clone "${label}" already exists.`;
const CANCELLED = 'git clone cancelled.';
const STOPPING = 'Remote run clone service is stopping.';

// The underlying readiness is observed by its own handler, which reports success or failure. This
// settling promise exists only so cleanup can wait through it without re-reporting its rejection.
async function settled(ready: Promise<void>): Promise<void> {
  try { await ready; } catch { /* reported by the readiness handler */ }
}

export class RemoteRunClones {
  private entries = new Map<string, LifecycleEntry>();
  private stopping = false;

  constructor(
    private workspaces: WorkspaceManager,
    private tokens: ProjectTokens,
    private mainLabel: string,
  ) {}

  lookup(label: string): string | undefined {
    if (this.stopping || workspaceLabelError(label) !== undefined) return undefined;
    const entry = this.entries.get(label.toLowerCase());
    return entry?.phase === 'ready' ? entry.dir : undefined;
  }

  create(label: string): Promise<RemoteRunCloneResult> {
    if (this.stopping) return Promise.resolve({ error: STOPPING });
    const invalid = workspaceLabelError(label);
    if (invalid !== undefined) return Promise.resolve({ error: invalidNameRefusal(label, invalid) });
    const reserved = this.reserve(label);
    if (typeof reserved === 'string') return Promise.resolve({ error: reserved });
    // Startup runs in a microtask so an immediate release or stop can cancel before the clone starts.
    queueMicrotask(() => { void this.start(reserved); });
    return reserved.done.promise;
  }

  release(label: string): Promise<RemoteRunCloneResult> {
    const invalid = workspaceLabelError(label);
    if (invalid !== undefined) return Promise.resolve({ error: invalidNameRefusal(label, invalid) });
    const entry = this.entries.get(label.toLowerCase());
    if (!entry) return Promise.resolve({});
    return this.releaseEntry(entry);
  }

  stop(): void | Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    // Ready clones stay tracked for the server's guarded removeAll, not removed under a live child.
    const draining: Promise<RemoteRunCloneResult>[] = [];
    for (const entry of this.entries.values()) {
      if (entry.phase !== 'ready') draining.push(this.releaseEntry(entry));
    }
    return draining.length === 0 ? undefined : this.drainAll(draining);
  }

  private async drainAll(draining: Promise<RemoteRunCloneResult>[]): Promise<void> {
    await Promise.all(draining);
  }

  private reserve(label: string): LifecycleEntry | string {
    const key = label.toLowerCase();
    const dir = workspacePath(label);
    if (sameLaunchName(label, this.mainLabel) || this.entries.has(key)
      || this.workspaces.tracks(dir) || existsSync(dir) || existsSync(workspaceTempPath(label))) {
      return alreadyExists(label);
    }
    const entry: LifecycleEntry = {
      label, key, dir,
      phase: 'queued',
      cancelRequested: false,
      cancelApplied: false,
      handle: undefined,
      readiness: undefined,
      cleanup: undefined,
      done: Promise.withResolvers<RemoteRunCloneResult>(),
    };
    this.entries.set(key, entry);
    return entry;
  }

  private async start(entry: LifecycleEntry): Promise<void> {
    if (entry.cancelRequested) { this.cancelQueued(entry); return; }
    // An occupied path can appear between reservation and the queued start; never borrow or clear it.
    if (this.workspaces.tracks(workspacePath(entry.label)) || existsSync(workspacePath(entry.label))
      || existsSync(workspaceTempPath(entry.label))) {
      this.forget(entry);
      entry.done.resolve({ error: alreadyExists(entry.label) });
      return;
    }
    let handle: ProvisioningWorkspace;
    try {
      const result = this.workspaces.create(entry.label, this.tokens.github, workspaceCloneOptions(AGENT_CLONE_DEPTH));
      if ('error' in result) {
        this.forget(entry);
        entry.done.resolve({ error: result.error });
        return;
      }
      handle = result;
    } catch (error) {
      this.forget(entry);
      entry.done.resolve({ error: errorText(error) });
      return;
    }
    entry.handle = handle;
    entry.dir = handle.dir;
    entry.phase = 'creating';
    entry.readiness = settled(handle.ready);
    if (entry.cancelRequested) this.applyCancel(entry);
    // A continuation only ever mutates its own entry; identity guarded removal in `forget` keeps an
    // old attempt from changing a later entry that reused the same label.
    void handle.ready.then(
      () => this.onReady(entry),
      (error: unknown) => { void this.fail(entry, entry.cancelRequested ? CANCELLED : errorText(error)); },
    );
  }

  private onReady(entry: LifecycleEntry): void {
    if (entry.cancelRequested) { void this.fail(entry, CANCELLED); return; }
    entry.phase = 'ready';
    entry.done.resolve({ dir: entry.dir });
  }

  private async fail(entry: LifecycleEntry, message: string): Promise<void> {
    await this.cleanup(entry);
    entry.done.resolve({ error: message });
  }

  private async releaseEntry(entry: LifecycleEntry): Promise<RemoteRunCloneResult> {
    if (entry.phase === 'ready') entry.phase = 'releasing';
    entry.cancelRequested = true;
    if (entry.phase === 'queued') {
      // Nothing has started yet. The queued start observes the cancellation and creates nothing,
      // so there is no directory to wait on or remove.
      entry.done.resolve({ error: CANCELLED });
      this.forget(entry);
      return {};
    }
    // A cancellation exception must not skip draining or removal; it is reported here, not on create.
    let cancelError: string | undefined;
    try { this.applyCancel(entry); } catch (error) { cancelError = errorText(error); }
    await this.cleanup(entry);
    return cancelError === undefined ? {} : { error: cancelError };
  }

  private cleanup(entry: LifecycleEntry): Promise<void> {
    if (entry.cleanup) return entry.cleanup;
    entry.cleanup = (async () => {
      await (entry.readiness ?? Promise.resolve());
      this.workspaces.remove(entry.dir);
      this.forget(entry);
    })();
    return entry.cleanup;
  }

  private applyCancel(entry: LifecycleEntry): void {
    if (entry.cancelApplied || !entry.handle) return;
    entry.cancelApplied = true;
    const cancel = entry.handle.cancel;
    if (cancel) cancel();
    else this.workspaces.cancel(entry.label);
  }

  private cancelQueued(entry: LifecycleEntry): void {
    this.forget(entry);
    entry.done.resolve({ error: CANCELLED });
  }

  private owns(entry: LifecycleEntry): boolean {
    return this.entries.get(entry.key) === entry;
  }

  private forget(entry: LifecycleEntry): void {
    if (this.owns(entry)) this.entries.delete(entry.key);
  }
}
