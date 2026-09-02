import type { AcpSession, AcpInfo } from '../acp/types.js';
import type { Persona } from '../personas.js';
import { connectAcp } from '../acp/index.js';
import { acpLaunchFor } from '../acp/launch.js';

// Maps a persona's harness directive to the ACP subprocess that runs its monitoring
// session. Every monitor gets its own fresh connection — never a tab's interactive
// session. By default `connectAcp` denies all tool permission requests; a persona that
// opts into web tools via its `tools:` line has those forwarded as `allowedTools`, and
// only those are approved (see acp-tools.ts). A persona with no tools stays tool-less.

type SpawnHooks = {
  onError: (message: string) => void;
  onConnect?: (info: AcpInfo) => void;
};

export function spawnMonitorSession(persona: Persona, cwd: string, hooks: SpawnHooks): AcpSession {
  return connectAcp({
    ...acpLaunchFor(persona.harness), cwd,
    onError: hooks.onError,
    onConnect: hooks.onConnect,
    allowedTools: persona.tools,
  });
}
