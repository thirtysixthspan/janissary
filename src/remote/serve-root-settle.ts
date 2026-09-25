import { loadConfig } from '../config.js';
import { loadProjectTokens } from '../project/tokens.js';
import { loadGitIdentity } from '../git/identity.js';
import { initWorkspaceDir } from '../workspace/index.js';
import { WorkspaceManager } from '../workspace/manager.js';
import type { ClientFrame, ServerFrame } from './protocol.js';
import { resolveRemoteRoot } from './serve-root.js';
import { runRootOffer, type RootOfferRun } from './serve-root-offer.js';
import { DetachedPeer } from './serve-detach.js';

// Settling `janus remote-serve`'s project root, split out of `serve.ts` so the server's frame loop
// only sequences it: which root a frame gets, and the setup that runs once one is known.

export type SettledRoot = { root: string; cloned?: { url: string; path: string } };

export type RootSettleContext = {
  pathArgument: string | undefined;
  home?: string;
  emit: (frame: ServerFrame) => void;
  // The offer in flight, or undefined once it settles: the server hands it `clone-answer` and
  // cancels it on shutdown.
  offering: (run: RootOfferRun | undefined) => void;
  stopping: () => boolean;
};

/**
 * The root for a `provision`, classified against the launching project's origin: used as it is,
 * cloned after an accepted offer, or refused — in which case `root-refused` has been emitted and
 * the answer is undefined. The classifier runs again under the offer's lock, since another launch
 * may have cloned the target in the meantime.
 */
export async function rootForProvision(
  frame: Extract<ClientFrame, { type: 'provision' }>, context: RootSettleContext,
): Promise<SettledRoot | undefined> {
  const githubToken = frame.tokens?.github;
  const { home, emit } = context;
  const classify = () => resolveRemoteRoot(context.pathArgument, frame.origin, { githubToken: githubToken !== undefined, home });
  const outcome = classify();
  if ('root' in outcome) return { root: outcome.root };
  if ('refusal' in outcome) { emit({ type: 'root-refused', refusal: outcome.refusal }); return undefined; }
  const run = runRootOffer(outcome.offer, { emit, classify, githubToken, home });
  context.offering(run);
  const result = await run.result;
  context.offering(undefined);
  if (context.stopping()) return undefined;
  if ('refusal' in result) { emit({ type: 'root-refused', refusal: result.refusal }); return undefined; }
  return result;
}

// The root an `attach` or a parked-capture query relays through, classified with the frame's origin
// the way a launch is, so a session rooted at `<home>/<repo-name>` is found again. Only an existing
// root counts: an offer or a refusal is no root, since a relay never clones.
export function rootForRelay(pathArgument: string | undefined, origin: string | undefined, home?: string): string | undefined {
  const outcome = resolveRemoteRoot(pathArgument, origin, { home });
  return 'root' in outcome ? outcome.root : undefined;
}

export type PeerHooks = ConstructorParameters<typeof DetachedPeer> extends [unknown, unknown, ...infer Rest] ? Rest : never;

// Start the detached peer for a settled root, writing through to stdout, or undefined when its
// socket cannot be opened.
export async function startPeer(root: string, session: string, ...hooks: PeerHooks): Promise<DetachedPeer | undefined> {
  const peer = new DetachedPeer(root, session, ...hooks);
  try {
    await peer.start((data) => { process.stdout.write(data); });
    return peer;
  } catch {
    peer.dispose();
    return undefined;
  }
}

// Everything `janus remote-serve` sets up from its project root, run once the root is settled by the
// first `provision` rather than at startup, in the order startup used to run it. Injectable on the
// server so tests can settle a root without loading this process's config or touching its home.
export function settleRoot(root: string): WorkspaceManager {
  loadConfig(root);
  loadProjectTokens(root);
  loadGitIdentity(root);
  initWorkspaceDir(root);
  return new WorkspaceManager(root);
}
