import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The credentials a project can hand its workspaced tabs, one row per file under `.janissary/`.
// Adding one is a row here plus its spec and documentation — the loader, the sandbox injection, the
// remote forwarding, and the per-token fallback all walk this table rather than naming credentials
// one at a time. Same property `sandbox/paths.ts` has for its path lists, for the same reason: four
// credentials arrived by hand-editing nine files each before this existed.
//
// Every file is user-provisioned and read-only to janissary: absent by default, and absent means no
// injection and a workspace that behaves exactly as it did before the file existed.
export const PROJECT_TOKENS = [
  {
    name: 'github',
    file: 'github-token',
    // A narrowly-scoped GitHub fine-grained PAT (Contents + Pull requests write, Metadata read).
    // The only row whose variable is not self-sufficient: `gh` also reads a config file the sandbox
    // denies, so `workspaceCredentialEnv` pairs this one with a `GH_CONFIG_DIR` redirect.
    env: 'GH_TOKEN',
  },
  {
    name: 'claude',
    file: 'claude-token',
    // A long-lived Claude Code subscription token (`claude setup-token`). Needed where the machine
    // has no usable Keychain, because the credentials file the CLI falls back to is a denied secret
    // path — so on Linux a workspaced harness has nothing else to authenticate with.
    env: 'CLAUDE_CODE_OAUTH_TOKEN',
  },
  {
    name: 'opencode',
    file: 'opencode-token',
    // An OpenCode API key, the variable the OpenCode Zen and OpenCode Go providers declare. Static:
    // no refresh, no expiry. Required inside a workspace rather than optional, since opencode's own
    // credential store is a denied secret path.
    env: 'OPENCODE_API_KEY',
  },
  {
    name: 'gemini',
    file: 'gemini-token',
    // A Google AI API key. The Google provider's route into a workspace, for the same reason: its
    // key lives in opencode's denied store. The provider accepts `GOOGLE_API_KEY` and
    // `GOOGLE_GENERATIVE_AI_API_KEY` equally and both still pass the environment scrub, so anyone
    // exporting one of those is unaffected; janissary injects this one.
    env: 'GEMINI_API_KEY',
  },
] as const;

export type ProjectTokenName = (typeof PROJECT_TOKENS)[number]['name'];

// Only the credentials this project actually configured. A name is absent rather than present-and-
// undefined, so a caller can spread the record without planting empty variables in an environment.
export type ProjectTokens = Partial<Record<ProjectTokenName, string>>;

let tokens: ProjectTokens = {};

function readToken(projectDir: string, file: string): string | undefined {
  const tokenPath = path.join(projectDir, '.janissary', file);
  if (!existsSync(tokenPath)) return undefined;
  return readFileSync(tokenPath, 'utf8').trim() || undefined;
}

// Read every configured token once, at startup — `main.ts` for the local server, `runRemoteServer`
// for the far end of a remote session. Replaces the cache outright rather than merging into it, so
// loading a second project never leaves the first one's credentials behind.
export function loadProjectTokens(projectDir: string): ProjectTokens {
  const loaded: ProjectTokens = {};
  for (const { name, file } of PROJECT_TOKENS) {
    const value = readToken(projectDir, file);
    if (value) loaded[name] = value;
  }
  tokens = loaded;
  return tokens;
}

export function getProjectTokens(): ProjectTokens {
  return tokens;
}
