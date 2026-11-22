import type { Managers } from '../managers.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { AcpSession } from './types.js';
import type { RemoteAcpSession } from '../remote/acp-session.js';
import type { AcpRole } from './role.js';
import type { AcpRoleSettings } from './ask-role.js';
import { appendAcp } from './response.js';
import { errorText } from '../error-text.js';
import { exhaustedError, noRoleModels, type AttemptFailure } from './ask-role.js';
import { tabRuntime } from '../tab/runtime.js';

const STILL_CONNECTING = 'ACP: the remote session is still connecting.';

export type StartHost = {
  managers: Managers;
  roleSettings: (root: string, role: AcpRole) => AcpRoleSettings;
  queueFor: (label: string, settings: AcpRoleSettings, role: AcpRole) => RoleEntry[];
  stillConnecting: (label: string) => boolean;
  acquire: (label: string, entry: RoleEntry, role: AcpRole) => AcpSession | RemoteAcpSession;
  sessionIdentity: (label: string, role: AcpRole) => string | undefined;
  close: (label: string, output: string, role: AcpRole) => boolean;
};

export function startCoreSession(
  host: StartHost, label: string, request: { withoutTools?: true } | undefined, role: AcpRole,
): { model?: string; error?: string; session?: string } {
  if (!host.managers.tab.byLabel(label)) return { error: 'Tab not found' };
  if (host.stillConnecting(label)) return { error: STILL_CONNECTING };
  const settings = host.roleSettings(host.managers.tab.launchDir, role);
  const entries = host.queueFor(label, settings, role);
  if (entries.length === 0) return { error: noRoleModels(role) };
  const tab = host.managers.tab.byLabel(label)!;
  if (request?.withoutTools === true) tabRuntime(tab).acpWithoutTools = true;
  const failures: AttemptFailure[] = [];
  for (const entry of entries) {
    try {
      host.acquire(label, entry, role);
      const identity = host.sessionIdentity(label, role);
      if (identity) return { model: entry.model, session: identity };
      failures.push({ entry, error: 'ACP: the session closed while starting.' });
    } catch (error) {
      const output = `ACP error: ${errorText(error)}`;
      appendAcp(host.managers, label, { input: '', output });
      host.close(label, output, role);
      failures.push({ entry, error: output });
    }
  }
  return { error: failures.length > 1 ? exhaustedError(failures, role) : failures[0].error };
}
