import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let geminiToken: string | undefined;

// Reads `.janissary/gemini-token` — a user-provisioned Google AI API key handed to a workspaced tab
// as `GEMINI_API_KEY`. This is the Google provider's route into a workspace: opencode keeps its own
// provider keys in `~/.local/share/opencode/auth.json`, which is a denied secret path (see
// `sandbox/paths.ts`), so a workspaced harness cannot read the key it was signed in with. The
// provider accepts `GOOGLE_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` equally; injecting one is
// enough, and the other two still pass the scrub for anyone who exports them instead. Absent by
// default: no token, no injection, workspaces behave as before.
export function loadGeminiToken(projectDir: string): string | undefined {
  const tokenPath = path.join(projectDir, '.janissary', 'gemini-token');
  if (!existsSync(tokenPath)) {
    geminiToken = undefined;
    return geminiToken;
  }
  const token = readFileSync(tokenPath, 'utf8').trim();
  geminiToken = token || undefined;
  return geminiToken;
}

export function getGeminiToken(): string | undefined {
  return geminiToken;
}
