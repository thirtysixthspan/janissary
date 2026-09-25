import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { startGitClone, type GitCloneHandle } from '../git/clone.js';
import { errorText } from '../error-text.js';
import type { ServerFrame } from './protocol.js';
import type { RootRefusal } from './root-refusal.js';
import type { RootOffer, RootOutcome } from './serve-root.js';
import { acquireRootLock } from './serve-root-lock.js';

// A missing project root, offered as a clone: take the target's lock, check again, ask the local
// side, and clone on a yes. Only what the clone created is ever removed — a cancelled or failed
// clone takes its folder with it (and any parent folders it had to create), while an existing empty
// `<home>/<repo-name>` keeps its folder and loses only its contents.

export type RootOfferContext = {
  emit: (frame: ServerFrame) => void;
  // Classify the target again once the lock is held, since another launch may have cloned it or
  // filled it while this one waited.
  classify: () => RootOutcome;
  // The forwarded GitHub credential, the only one the clone may use.
  githubToken?: string;
  home?: string;
};

export type RootOfferResult = { root: string; cloned?: { url: string; path: string } } | { refusal: RootRefusal };

export type RootOfferRun = {
  result: Promise<RootOfferResult>;
  // Deliver the user's answer. False when no question is pending.
  answer: (accept: boolean) => boolean;
  // Closing the tab or losing the transport: an unanswered prompt is declined, a running clone is
  // killed and its partial folder removed, and the lock is released. Synchronous, so it is complete
  // before the process exits.
  cancel: () => void;
};

// The highest folder along `target`'s path that does not exist yet: everything the clone would
// create, so everything a failed one removes.
function firstMissing(target: string): string {
  let missing = target;
  let parent = path.dirname(missing);
  while (parent !== missing && !existsSync(parent)) {
    missing = parent;
    parent = path.dirname(missing);
  }
  return missing;
}

function removeCreated(target: string, created: string | undefined): void {
  if (created !== undefined) { rmSync(created, { recursive: true, force: true }); return; }
  if (!existsSync(target)) return;
  for (const entry of readdirSync(target)) rmSync(path.join(target, entry), { recursive: true, force: true });
}

class OfferRun {
  private cancelled = new AbortController();
  private pending: ((accept: boolean) => void) | undefined;
  private clone: { handle: GitCloneHandle; target: string; created: string | undefined } | undefined;
  private release: (() => void) | undefined;

  constructor(private context: RootOfferContext) {}

  async run(first: RootOffer): Promise<RootOfferResult> {
    const declined: RootOfferResult = { refusal: { kind: 'declined', path: first.target, url: first.url } };
    try {
      this.release = await acquireRootLock(first.target, { home: this.context.home, signal: this.cancelled.signal });
    } catch {
      return declined;
    }
    try {
      return await this.offer();
    } finally {
      this.release();
    }
  }

  answer(accept: boolean): boolean {
    if (!this.pending) return false;
    const pending = this.pending;
    this.pending = undefined;
    pending(accept);
    return true;
  }

  cancel(): void {
    this.cancelled.abort();
    this.answer(false);
    if (this.clone) {
      this.clone.handle.cancel();
      removeCreated(this.clone.target, this.clone.created);
    }
    this.release?.();
  }

  private async offer(): Promise<RootOfferResult> {
    const outcome = this.context.classify();
    if (!('offer' in outcome)) return outcome;
    const { target, url, home } = outcome.offer;
    if (this.cancelled.signal.aborted) return { refusal: { kind: 'declined', path: target, url } };
    this.context.emit({ type: 'clone-offer', path: target, url, ...(home !== undefined && { home }) });
    const accept = await new Promise<boolean>((resolve) => { this.pending = resolve; });
    if (!accept || this.cancelled.signal.aborted) return { refusal: { kind: 'declined', path: target, url } };
    const created = existsSync(target) ? undefined : firstMissing(target);
    try {
      mkdirSync(path.dirname(target), { recursive: true });
      await this.cloneInto(url, target, created);
    } catch (error) {
      removeCreated(target, created);
      return { refusal: { kind: 'clone-failed', path: target, url, reason: errorText(error) } };
    }
    return { root: target, cloned: { url, path: target } };
  }

  private async cloneInto(url: string, target: string, created: string | undefined): Promise<void> {
    const handle = startGitClone(url, target, { githubToken: this.context.githubToken, keepStderr: true });
    this.clone = { handle, target, created };
    try {
      await handle.ready;
    } finally {
      this.clone = undefined;
    }
  }
}

export function runRootOffer(offer: RootOffer, context: RootOfferContext): RootOfferRun {
  const run = new OfferRun(context);
  return {
    result: run.run(offer),
    answer: (accept) => run.answer(accept),
    cancel: () => run.cancel(),
  };
}
