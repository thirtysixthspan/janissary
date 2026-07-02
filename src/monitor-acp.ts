import type { AcpSession, AcpInfo } from './types.js';
import type { Persona } from './personas.js';
import { connectAcp } from './acp.js';

// Maps a persona's harness directive to the ACP subprocess that runs its monitoring
// session. Every monitor gets its own fresh connection — never a tab's interactive
// session. `connectAcp` auto-denies all tool permission requests, so monitoring
// sessions are inherently tool-less: they can only read prompts and reply.

type SpawnHooks = {
  onError: (message: string) => void;
  onConnect?: (info: AcpInfo) => void;
};

export function spawnMonitorSession(persona: Persona, cwd: string, hooks: SpawnHooks): AcpSession {
  const { harness, model, variant } = persona.harness;
  if (harness === 'opencode') {
    // Only `model` goes into the config: opencode rejects unknown keys, and a rejected
    // config kills the subprocess on startup. The directive's variant is not mapped yet.
    return connectAcp({
      command: 'opencode', args: ['acp'], cwd,
      onError: hooks.onError,
      onConnect: hooks.onConnect,
      env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model }) },
    });
  }
  // claude: the Claude Code ACP adapter. Model and thinking effort are passed via its
  // environment (best-effort mapping; the adapter ignores variables it doesn't know).
  return connectAcp({
    command: 'npx', args: ['@zed-industries/claude-code-acp'], cwd,
    onError: hooks.onError,
    onConnect: hooks.onConnect,
    env: { ANTHROPIC_MODEL: model, CLAUDE_THINKING_EFFORT: variant },
  });
}
