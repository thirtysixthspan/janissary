import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let opencodeToken: string | undefined;

// Reads `.janissary/opencode-token` — a user-provisioned OpenCode API key handed to a workspaced tab
// as `OPENCODE_API_KEY`, the variable the OpenCode Zen and OpenCode Go providers declare. Unlike the
// other two credentials this one is a static key with no refresh and no expiry. A local opencode
// harness usually needs nothing here, since it reads its own `~/.local/share/opencode` credentials
// through an existing carve-in; it is a remote host with no opencode login of its own that does.
// Absent by default: no token, no injection, workspaces behave as before.
export function loadOpencodeToken(projectDir: string): string | undefined {
  const tokenPath = path.join(projectDir, '.janissary', 'opencode-token');
  if (!existsSync(tokenPath)) {
    opencodeToken = undefined;
    return opencodeToken;
  }
  const token = readFileSync(tokenPath, 'utf8').trim();
  opencodeToken = token || undefined;
  return opencodeToken;
}

export function getOpencodeToken(): string | undefined {
  return opencodeToken;
}
