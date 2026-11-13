import type { AcpSession, AcpPromptResult } from './types.js';
import { connectAcp } from './index.js';
import { createRemoteAcpSession, type RemoteAcpSession } from '../remote/acp-session.js';
import { acpLaunchForEntry } from './launch.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { Managers } from '../managers.js';
import { settleAcpPrompt } from './response.js';
import { tabRuntime } from '../tab/runtime.js';
import type { TabRuntime } from '../tab/types.js';
import { acpActivity, type AcpActivityKind } from './activity.js';
import { beginCoreRecord, closeCoreRecord, coreActivity } from './record-feed.js';
import { ACP_ROLES, DEFAULT_ACP_ROLE, type AcpRole } from './role.js';

type ConnectHooks = { onError: (message: string) => void; onConnect: () => void };
type Session = AcpSession | RemoteAcpSession;
type CoreSession = { session?: Session; runtime: TabRuntime; identity: string; entry: RoleEntry; model?: string };
type RoleSessions = Map<AcpRole, CoreSession>;

export class AcpSessionManager {
  private sessions = new Map<string, RoleSessions>();
  private sessionCounter = 0;
  private remoteCounter = 0;

  constructor(protected managers: Managers) {}

  has(label: string, role: AcpRole = DEFAULT_ACP_ROLE): boolean { return this.sessions.get(label)?.has(role) === true; }

  label(label: string, role: AcpRole = DEFAULT_ACP_ROLE): string | undefined {
    return this.sessions.get(label)?.get(role)?.model;
  }

  sessionIdentity(label: string, role: AcpRole = DEFAULT_ACP_ROLE): string | undefined {
    return this.sessions.get(label)?.get(role)?.identity;
  }

  session(
    label: string, cwd: string, entry: RoleEntry, hooks: ConnectHooks, role: AcpRole = DEFAULT_ACP_ROLE,
  ): Session {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) throw new Error('Tab not found');
    const runtime = tabRuntime(tab);
    const existing = this.sessions.get(label)?.get(role);
    if (existing?.runtime === runtime && existing.session) return existing.session;
    const launch = acpLaunchForEntry(entry);
    if (!launch) throw new Error(`no ACP adapter for harness "${entry.harness}".`);
    const { model } = entry;
    const holder: CoreSession = { runtime, identity: `acp-${++this.sessionCounter}`, entry };
    this.sessionsFor(label, true)!.set(role, holder);
    const source = {
      kind: 'acp' as const, role, model, ownerLabel: label, ownerName: tab.title ?? label,
      ...(tab.remote && { host: tab.remote.host }),
    };
    const current = () => this.sessions.get(label)?.get(role) === holder
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
      if (current()) coreActivity(this.managers.acpRecords, runtime, kind, text, role);
    };
    const channel = tab.remote ? this.managers.remote.get(label) : undefined;
    try {
      holder.session = channel
        ? createRemoteAcpSession(channel, { ...launch, id: `racp${++this.remoteCounter}`, offline: tab.offline }, {
          onError, onConnect, onActivity: activity,
          onTransportLost: () => {
            const result = { answered: false as const, error: 'Remote connection lost.' };
            onError(result.error);
            this.closeTab(label, result);
          },
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
      this.deleteSession(label, role, holder);
      holder.session?.kill();
      throw error;
    }
  }

  close(
    label: string, output?: AcpPromptResult | string, role: AcpRole = DEFAULT_ACP_ROLE,
  ): boolean {
    const settled = typeof output === 'string'
      ? { answered: false as const, error: output }
      : output ?? { answered: false as const, error: 'ACP session closed.' };
    const holder = this.sessions.get(label)?.get(role);
    const runtime = holder?.runtime ?? this.managers.tab.byLabel(label)?.runtime;
    settleAcpPrompt(this.managers, label, settled, () => {
      if (runtime) closeCoreRecord(this.managers.acpRecords, runtime, role);
      this.deleteSession(label, role, holder);
      holder?.session?.kill();
    }, role);
    return holder !== undefined;
  }

  closeTab(label: string, output?: AcpPromptResult | string): void {
    for (const role of ACP_ROLES) this.close(label, output, role);
  }

  closeAll(): void {
    for (const label of this.sessions.keys()) this.closeTab(label);
  }

  dispose(): void { this.closeAll(); }

  protected currentSession(label: string, role: AcpRole = DEFAULT_ACP_ROLE): Session | undefined {
    return this.sessions.get(label)?.get(role)?.session;
  }

  // The role entry the tab's open session was launched from, while that session is still the tab's.
  protected entryOf(label: string, role: AcpRole = DEFAULT_ACP_ROLE): RoleEntry | undefined {
    const holder = this.sessions.get(label)?.get(role);
    const current = holder?.session !== undefined && holder.runtime === this.managers.tab.byLabel(label)?.runtime;
    return current ? holder.entry : undefined;
  }

  protected isCurrent(label: string, session: Session, role: AcpRole = DEFAULT_ACP_ROLE): boolean {
    const holder = this.sessions.get(label)?.get(role);
    return holder?.session === session && holder.runtime === this.managers.tab.byLabel(label)?.runtime;
  }

  private sessionsFor(label: string, create = false): RoleSessions | undefined {
    let sessions = this.sessions.get(label);
    if (!sessions && create) {
      sessions = new Map();
      this.sessions.set(label, sessions);
    }
    return sessions;
  }

  private deleteSession(label: string, role: AcpRole, holder?: CoreSession): void {
    const sessions = this.sessions.get(label);
    if (holder && sessions?.get(role) === holder) sessions.delete(role);
    if (sessions?.size === 0) this.sessions.delete(label);
  }
}
