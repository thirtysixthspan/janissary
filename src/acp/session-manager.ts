import type { AcpSession, AcpInfo, AcpPromptResult } from './types.js';
import { connectAcp } from './index.js';
import { createRemoteAcpSession } from '../remote/acp-session.js';
import { acpLaunchFor } from './launch.js';
import type { Managers } from '../managers.js';
import type { PersonaHarness } from '../persona-parsing.js';
import { settleAcpPrompt } from './response.js';

const acpHarnessFor = (model: string): PersonaHarness => ({ harness: 'opencode', model, variant: 'default' });

// Split a `provider/model` config string into its parts; a bare `model` with no slash has no
// provider. Drives the connections-panel label.
function parseModel(model: string): AcpInfo {
  const slash = model.indexOf('/');
  return slash === -1 ? { model } : { provider: model.slice(0, slash), model: model.slice(slash + 1) };
}

// Hooks the caller supplies when connecting: `onError` surfaces connection-level errors into the tab
// transcript, `onConnect` re-renders once the handshake completes (the manager records the session's
// model info just before calling it, so the connection label resolves).
type ConnectHooks = {
  onError: (message: string) => void;
  onConnect: () => void;
};

export class AcpSessionManager {
  private sessions = new Map<string, AcpSession>();
  private info = new Map<string, AcpInfo>();
  // Which session each tab is holding, minted here rather than carried on the session itself. A tab's
  // session is replaced whenever the old one dies, and a caller that primed the old one — a persona, a
  // trust delimiter — has to be able to see that the session it is now talking to is a different one.
  // Opaque: compared for equality and never parsed.
  private sessionIds = new Map<string, string>();
  private sessionCounter = 0;
  // Minted locally, like every other remote process id: routing by id makes a chunk still in flight
  // from a session `acp reset` disposed land on a detached listener rather than in its successor.
  private remoteCounter = 0;

  constructor(protected managers: Managers) {}

  // Whether a tab has a connected (or connecting) ACP session. Drives the connections panel and completion.
  has(label: string): boolean {
    return this.sessions.has(label);
  }

  // The `provider/model` (or bare `model`) string for a tab's session, or undefined when none is
  // connected. Display-only; populated on the connection handshake.
  label(label: string): string | undefined {
    const info = this.info.get(label);
    if (!info) return undefined;
    return info.provider ? `${info.provider}/${info.model ?? ''}` : info.model;
  }

  // Which session a tab is currently holding, or undefined when it holds none. Changes whenever the
  // tab's session is replaced, which is what lets a caller learn that the session it primed is gone.
  sessionIdentity(label: string): string | undefined {
    return this.sessionIds.get(label);
  }

  // The tab's ACP session, connecting one on first use and reusing it thereafter. A local tab's
  // agent runs in `cwd`; a remote tab's runs on the other machine, inside the workspace clone that
  // host provisioned, so `cwd` does not apply to it. `hooks.onConnect` fires after the handshake, by
  // which point the session's model info is recorded (so `label` resolves).
  //
  // `model` is resolved by the caller, which is the only place that can report a catalog with
  // nothing in it; what is recorded here is therefore the model the session actually launched with.
  session(label: string, cwd: string, model: string, hooks: ConnectHooks): AcpSession {
    let session = this.sessions.get(label);
    if (!session) {
      const identity = `acp-${++this.sessionCounter}`;
      const info = parseModel(model);
      const launch = acpLaunchFor(acpHarnessFor(model));
      const tab = this.managers.tab.byLabel(label);
      let connecting = true;
      let failed = false;
      const connect: ConnectHooks = {
        onError: (message) => {
          if (!connecting && this.sessions.get(label) !== session) return;
          failed = true;
          hooks.onError(message);
        },
        onConnect: () => {
          if (failed || (!connecting && this.sessions.get(label) !== session)) return;
          this.info.set(label, info);
          hooks.onConnect();
        },
      };
      const channel = tab?.remote ? this.managers.remote.get(label) : undefined;
      session = channel
        ? createRemoteAcpSession(channel, { ...launch, id: `racp${++this.remoteCounter}`, offline: tab?.offline }, connect)
        : connectAcp({
          ...launch, cwd,
          onError: connect.onError,
          onConnect: connect.onConnect,
          workspaceDir: tab?.workspaceDir,
          offline: tab?.offline,
        });
      connecting = false;
      if (failed) session.kill();
      else {
        this.sessions.set(label, session);
        this.sessionIds.set(label, identity);
      }
    }
    return session;
  }

  // Kill and forget a tab's session (and its info). Returns whether one was open — the
  // `connection close acp` path re-renders and reports only when it actually closed one. A close is
  // how a prompt in flight is settled when a reset tears the session down underneath it, so the
  // waiting caller hears a refusal rather than an answer.
  close(label: string, output?: AcpPromptResult | string): boolean {
    const settled = typeof output === 'string'
      ? { answered: false as const, error: output }
      : output ?? { answered: false as const, error: 'ACP session closed.' };
    settleAcpPrompt(this.managers, label, settled);
    this.info.delete(label);
    this.sessionIds.delete(label);
    const session = this.sessions.get(label);
    if (!session) return false;
    this.sessions.delete(label);
    session.kill();
    return true;
  }

  closeTab(label: string): void { this.close(label); }

  // Kill every session and forget all info (app shutdown).
  closeAll(): void {
    for (const label of this.sessions.keys()) this.close(label);
    this.sessions.clear();
    this.info.clear();
    this.sessionIds.clear();
  }

  dispose(): void {
    this.closeAll();
  }

  protected isCurrent(label: string, session: AcpSession): boolean {
    return this.sessions.get(label) === session;
  }
}
