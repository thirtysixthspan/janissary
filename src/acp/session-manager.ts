import type { AcpSession, AcpPromptResult } from './types.js';
import { connectAcp } from './index.js';
import { createRemoteAcpSession } from '../remote/acp-session.js';
import { acpLaunchFor } from './launch.js';
import type { Managers } from '../managers.js';
import { settleAcpPrompt } from './response.js';
import { tabRuntime } from '../tab/runtime.js';
import type { TabRuntime } from '../tab/types.js';
import { acpActivity, type AcpActivityKind } from './activity.js';
import { beginCoreRecord, closeCoreRecord, coreActivity } from './record-feed.js';

type ConnectHooks = { onError: (message: string) => void; onConnect: () => void };
type CoreSession = { session?: AcpSession; runtime: TabRuntime; identity: string; model?: string };

export class AcpSessionManager {
  private sessions = new Map<string, CoreSession>();
  private sessionCounter = 0;
  private remoteCounter = 0;

  constructor(protected managers: Managers) {}

  has(label: string): boolean { return this.sessions.has(label); }

  label(label: string): string | undefined { return this.sessions.get(label)?.model; }

  sessionIdentity(label: string): string | undefined { return this.sessions.get(label)?.identity; }

  session(label: string, cwd: string, model: string, hooks: ConnectHooks): AcpSession {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) throw new Error('Tab not found');
    const runtime = tabRuntime(tab);
    const existing = this.sessions.get(label);
    if (existing?.runtime === runtime && existing.session) return existing.session;
    const holder: CoreSession = { runtime, identity: `acp-${++this.sessionCounter}` };
    this.sessions.set(label, holder);
    const source = { kind: 'acp' as const, model, ownerLabel: label, ownerName: tab.title ?? label };
    const current = () => this.sessions.get(label) === holder
      && this.managers.tab.byLabel(label)?.runtime === runtime && !runtime.closing;
    let connecting = true;
    let connected = false;
    let failure: string | undefined;
    const publish = () => {
      if (!current() || failure !== undefined) return;
      beginCoreRecord(this.managers.acpRecords, runtime, source);
      holder.model = model;
      hooks.onConnect();
    };
    const onError = (message: string) => {
      if (!current()) return;
      failure = message;
      if (!connecting) hooks.onError(message);
    };
    const onConnect = () => {
      connected = true;
      if (!connecting) publish();
    };
    const activity = (kind: AcpActivityKind, text: string) => {
      if (current()) coreActivity(this.managers.acpRecords, runtime, kind, text);
    };
    const launch = acpLaunchFor({ harness: 'opencode', model, variant: 'default' });
    const channel = tab.remote ? this.managers.remote.get(label) : undefined;
    try {
      holder.session = channel
        ? createRemoteAcpSession(channel, { ...launch, id: `racp${++this.remoteCounter}`, offline: tab.offline }, {
          onError, onConnect, onActivity: activity,
          onTransportLost: () => onError('Remote connection lost.'),
        })
        : connectAcp({
          ...launch, cwd, onError, onConnect, workspaceDir: tab.workspaceDir, offline: tab.offline,
          onActivity: (update) => {
            const classified = acpActivity(update);
            if (classified) activity(classified.kind, classified.text);
          },
        });
      connecting = false;
      if (!current()) holder.session.kill();
      else if (failure !== undefined) hooks.onError(failure);
      else if (connected) publish();
      return holder.session;
    } catch (error) {
      if (this.sessions.get(label) === holder) this.sessions.delete(label);
      holder.session?.kill();
      throw error;
    }
  }

  close(label: string, output?: AcpPromptResult | string): boolean {
    const settled = typeof output === 'string'
      ? { answered: false as const, error: output }
      : output ?? { answered: false as const, error: 'ACP session closed.' };
    const holder = this.sessions.get(label);
    const runtime = holder?.runtime ?? this.managers.tab.byLabel(label)?.runtime;
    settleAcpPrompt(this.managers, label, settled, () => {
      if (runtime) closeCoreRecord(this.managers.acpRecords, runtime);
      if (this.sessions.get(label) === holder) this.sessions.delete(label);
      holder?.session?.kill();
    });
    return holder !== undefined;
  }

  closeTab(label: string): void { this.close(label); }

  closeAll(): void {
    for (const label of this.sessions.keys()) this.close(label);
  }

  dispose(): void { this.closeAll(); }

  protected currentSession(label: string): AcpSession | undefined { return this.sessions.get(label)?.session; }

  protected isCurrent(label: string, session: AcpSession): boolean {
    const holder = this.sessions.get(label);
    return holder?.session === session && holder.runtime === this.managers.tab.byLabel(label)?.runtime;
  }
}
