import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let claudeToken: string | undefined;

// Reads `.janissary/claude-token` — a user-provisioned long-lived Claude Code subscription token
// (minted with `claude setup-token`) handed to a workspaced tab as `CLAUDE_CODE_OAUTH_TOKEN`. It is
// what lets a `claude` harness authenticate on a host with no Keychain, where its own credentials
// file is denied by the sandbox. Absent by default: no token, no injection, workspaces behave as before.
export function loadClaudeToken(projectDir: string): string | undefined {
  const tokenPath = path.join(projectDir, '.janissary', 'claude-token');
  if (!existsSync(tokenPath)) {
    claudeToken = undefined;
    return claudeToken;
  }
  const token = readFileSync(tokenPath, 'utf8').trim();
  claudeToken = token || undefined;
  return claudeToken;
}

export function getClaudeToken(): string | undefined {
  return claudeToken;
}
