import type { AcpSession, AcpInfo } from '../acp/types.js';
import type { Persona } from '../personas.js';
import type { AcpRole } from '../acp/role.js';
import { connectAcp } from '../acp/index.js';
import { readRoleSettings, noRoleModels } from '../acp/ask-role.js';
import { acpLaunchForEntry } from '../acp/launch.js';

// Maps a persona's role to the ACP subprocess that runs its monitoring session. Every monitor gets
// its own fresh connection — never a tab's interactive session. The launch comes from the role's
// first entry; web tools now come from the role's grants rather than a persona directive, so none are
// forwarded here. A role with no entries, or an entry whose harness has no adapter, opens no session.

type SpawnHooks = {
  onError: (message: string) => void;
  onConnect?: (info: AcpInfo) => void;
};

export function spawnMonitorSession(persona: Persona, cwd: string, hooks: SpawnHooks): AcpSession {
  const entry = readRoleSettings(cwd, persona.role).entries[0];
  if (!entry) {
    const error = noRoleModels(persona.role as AcpRole);
    hooks.onError(error);
    throw new Error(error);
  }
  const launch = acpLaunchForEntry(entry);
  if (!launch) {
    const error = `no ACP adapter for harness "${entry.harness}".`;
    hooks.onError(error);
    throw new Error(error);
  }
  return connectAcp({
    ...launch, cwd,
    onError: hooks.onError,
    onConnect: hooks.onConnect,
  });
}
