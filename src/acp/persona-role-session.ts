import type { AcpSession } from './types.js';
import type { Managers } from '../managers.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import { connectAcp } from './index.js';
import { acpLaunchForEntry } from './launch.js';
import { messageBus } from '../bus.js';
import { tabRuntime } from '../tab/runtime.js';
import { formatContext } from '../monitor/context.js';
import {
  existingPersonaRoleRuntime, forgetPersonaRole, personaRoleRuntime,
  type PersonaRoleHooks, type PersonaRoleRuntime,
} from './persona-role-state.js';

export class PersonaRoleSessionManager {
  private counter = 0;

  constructor(private readonly managers: Managers) {}

  hasSession(label: string, role: string): boolean {
    return this.existing(label, role)?.session !== undefined;
  }

  session(label: string, role: string, entry: RoleEntry, cwd: string, hooks: PersonaRoleHooks): AcpSession {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) throw new Error('Tab not found');
    const runtime = tabRuntime(tab);
    const state = personaRoleRuntime(runtime, role);
    state.hooks = hooks;
    if (state.session) return state.session;
    const launch = acpLaunchForEntry(entry);
    if (!launch) throw new Error(`no ACP adapter for harness "${entry.harness}".`);
    const identity = `persona-acp-${++this.counter}`;
    const session = connectAcp({
      ...launch, cwd, workspaceDir: tab.workspaceDir, offline: tab.offline,
      onError: (message) => this.died(label, role, session, message),
      onConnect: () => messageBus.emit('state', { type: 'dirty' }),
    });
    state.session = session;
    state.identity = identity;
    state.model = entry.model;
    return session;
  }

  private existing(label: string, role: string): PersonaRoleRuntime | undefined {
    const runtime = this.managers.tab.byLabel(label)?.runtime;
    return runtime ? existingPersonaRoleRuntime(runtime, role) : undefined;
  }

  private died(label: string, role: string, session: AcpSession, message: string): void {
    const state = this.existing(label, role);
    if (!state || state.session !== session) return;
    const hooks = state.hooks;
    this.forget(label, role);
    messageBus.emit('state', { type: 'dirty' });
    hooks?.onError(message);
  }

  private forget(label: string, role: string): void {
    const runtime = this.managers.tab.byLabel(label)?.runtime;
    if (runtime) forgetPersonaRole(runtime, role);
  }

  record(label: string, role: string, text: string, kind: 'input' | 'response'): void {
    const state = this.existing(label, role);
    if (!state) return;
    (state.context ??= []).push({ role: kind, text });
  }

  transcript(label: string, role: string): string {
    const context = this.existing(label, role)?.context;
    return context ? formatContext(context) : '';
  }

  close(label: string, role: string): boolean {
    const state = this.existing(label, role);
    if (!state?.session) return false;
    state.session.kill();
    this.forget(label, role);
    return true;
  }

  releaseTab(label: string): void {
    const roles = this.managers.tab.byLabel(label)?.runtime?.personaRoles;
    if (!roles) return;
    for (const role of Object.keys(roles)) this.close(label, role);
  }

  dispose(): void {
    for (const tab of this.managers.tab.tabs) this.releaseTab(tab.label);
  }
}
