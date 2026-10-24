import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { setGitIdentity } from '../git/identity.js';
import { janissaryRoot } from '../janissary-root.js';
import { confinedHarnessSpawn, type HarnessSpawnOptions } from './harness-spawn.js';
import { SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE } from './profile.js';

// The confined harness spawn's arguments and environment, built without asking whether this host
// can confine anything — so these run on every platform, CI's Linux runners included. Only the
// check that `sandboxSpawn` actually wraps through `sandbox-exec` on a confining host stays
// macOS-only, in `./index.test.ts`.

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
});

afterEach(() => {
  rmSync(`${workspaceDir}.tmp`, { recursive: true, force: true });
  rmSync(workspaceDir, { recursive: true, force: true });
});

function build(options: HarnessSpawnOptions = {}, env: NodeJS.ProcessEnv = process.env, args: string[] = []) {
  return confinedHarnessSpawn(options, workspaceDir, 'bash', args, env);
}

function dValues(result: { args: string[] }): string[] {
  return result.args.filter((_, i) => result.args[i - 1] === '-D').map((v) => v.slice(v.indexOf('=') + 1));
}

function dNames(result: { args: string[] }): string[] {
  return result.args.filter((_, i) => result.args[i - 1] === '-D').map((v) => v.split('=', 1)[0]);
}

function rulesOnly(text: string): string {
  return text.split('\n').filter((line) => !line.trimStart().startsWith(';')).join('\n');
}

describe('confinedHarnessSpawn', () => {
  it('runs the command after the profile and its parameters', () => {
    const result = build({}, process.env, ['-lc', 'echo hi']);
    expect(result.command).toBe('sandbox-exec');
    expect(result.args[0]).toBe('-p');
    const tail = result.args.slice(result.args.indexOf('--') + 1);
    expect(tail).toEqual(['bash', '-lc', 'echo hi']);
  });

  // Derived from the profile text rather than listed by hand, so a parameter added to the profile
  // with no `-D` binding fails here instead of on the first confined spawn of a Mac.
  it.each([
    { variant: 'online', options: {} },
    { variant: 'offline', options: { offline: true } },
    { variant: 'one installed skill', options: { installedSkillDirs: [path.join(janissaryRoot(), 'skills', 'ask-user')] } },
  ])('binds every parameter the $variant profile names', ({ options }) => {
    const result = build(options);
    const named = [...rulesOnly(result.args[1] ?? '').matchAll(/\(param "([^"]+)"\)/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(0);
    const bound = dNames(result);
    for (const name of named) expect(bound).toContain(name);
  });

  // The one secret-deny entry that overrides a carve-in rather than backing up a denial the tables
  // already imply: `.local/share/opencode` is a write carve-out (and so a read carve-in), and the
  // credential file inside it has to lose anyway. Both halves are asserted here — the deny reaches
  // the profile, and denying it did not deny the directory the harness writes its database to.
  it('binds a secret-deny param to opencode\'s credential file without denying its directory', () => {
    const values = dValues(build());
    expect(values).toContain(path.join(realpathSync(homedir()), '.local/share/opencode/auth.json'));
    expect(values).toContain(path.join(realpathSync(homedir()), '.local/share/opencode'));
  });

  // opencode's cached model catalog is readable so a workspaced harness sees the same model list
  // the non-sandboxed opencode has already fetched. Asserted alongside the directories it must NOT
  // have widened into: carving in the cache tree itself would let a sandboxed agent read (and, if
  // it were ever also a write carve-out) forge anything else opencode caches there.
  it('binds a read-carvein param to opencode\'s model cache without carving in its directory', () => {
    const values = dValues(build());
    const home = realpathSync(homedir());
    expect(values).toContain(path.join(home, '.cache/opencode/models.json'));
    expect(values).not.toContain(path.join(home, '.cache/opencode'));
    expect(values).not.toContain(path.join(home, '.cache'));
  });

  // A PTY spawn runs its command through an interactive login shell, so the shell's own startup
  // files have to be readable — otherwise the $HOME content deny fails that read silently and a
  // workspaced harness starts with none of the user's PATH additions. zsh's are the ones that
  // matter most: `.zshrc`, where a version manager puts its PATH setup, is read only when the
  // shell is interactive.
  it('binds read-carvein params to the shell startup files a launched shell sources', () => {
    const result = build();
    const carveIns = result.args
      .filter((_, i) => result.args[i - 1] === '-D' && result.args[i].startsWith('R'))
      .map((v) => v.slice(v.indexOf('=') + 1));
    const home = realpathSync(homedir());
    for (const file of ['.zshenv', '.zprofile', '.zshrc', '.zlogin', '.bash_profile', '.bashrc', '.profile']) {
      expect(carveIns).toContain(path.join(home, file));
    }
  });

  // The task picker inserts `execute $janissary/ai/tasks/<task>.md` for a built-in task, so a
  // workspaced agent has to be able to open the file that names. An install under $HOME — a global
  // npm prefix, or a development checkout — falls under the $HOME content deny without this.
  it('carves the install\'s ai/ directory into the read allow-list, literal and resolved', () => {
    const result = build();
    const aiDir = path.join(janissaryRoot(), 'ai');
    expect(result.args).toContain(`JANISSARY_AI_L=${aiDir}`);
    expect(result.args).toContain(`JANISSARY_AI_R=${realpathSync(aiDir)}`);
    expect(SANDBOX_PROFILE).toContain('(subpath (param "JANISSARY_AI_L"))');
    expect(SANDBOX_PROFILE).toContain('(subpath (param "JANISSARY_AI_R"))');
  });

  // Those same task prompts tell the agent to run `$janissary/scripts/run.mjs`, so the runner and
  // the scripts it dispatches to have to be readable on the same terms the prompts are.
  it('carves the install\'s scripts/ directory into the read allow-list, literal and resolved', () => {
    const result = build();
    const scriptsDir = path.join(janissaryRoot(), 'scripts');
    expect(result.args).toContain(`JANISSARY_SCRIPTS_L=${scriptsDir}`);
    expect(result.args).toContain(`JANISSARY_SCRIPTS_R=${realpathSync(scriptsDir)}`);
    expect(SANDBOX_PROFILE).toContain('(subpath (param "JANISSARY_SCRIPTS_L"))');
    expect(SANDBOX_PROFILE).toContain('(subpath (param "JANISSARY_SCRIPTS_R"))');
  });

  // Every package-update task runs `$janissary/scripts/run.mjs check-malicious-package`, which reads
  // its blocklist from the install's security/ directory beside scripts/.
  it('carves the install\'s security/ directory into the read allow-list, literal and resolved', () => {
    const result = build();
    const securityDir = path.join(janissaryRoot(), 'security');
    expect(result.args).toContain(`JANISSARY_SECURITY_L=${securityDir}`);
    expect(result.args).toContain(`JANISSARY_SECURITY_R=${realpathSync(securityDir)}`);
    expect(SANDBOX_PROFILE).toContain('(subpath (param "JANISSARY_SECURITY_L"))');
    expect(SANDBOX_PROFILE).toContain('(subpath (param "JANISSARY_SECURITY_R"))');
  });

  it('permits selected installed skill support files but not unrelated install paths', () => {
    const selectedDir = path.join(janissaryRoot(), 'skills', 'ask-user');
    const unrelatedInstallDir = path.join(janissaryRoot(), 'node_modules');
    const spawn = build({ installedSkillDirs: [selectedDir, unrelatedInstallDir] });
    const profile = spawn.args[1] ?? '';
    expect(profile).toContain('(subpath (param "JANISSARY_SKILL_0_L"))');
    expect(profile).toContain('(subpath (param "JANISSARY_SKILL_0_R"))');
    expect(profile).not.toContain('JANISSARY_SKILL_1');
    expect(profile.lastIndexOf('(with errno ENOENT)')).toBeGreaterThan(profile.indexOf('JANISSARY_SKILL_0_L'));
    expect(spawn.args).toContain(`JANISSARY_SKILL_0_L=${selectedDir}`);
    expect(spawn.args).not.toContain(`JANISSARY_SKILL_1_L=${unrelatedInstallDir}`);
    expect(profile.lastIndexOf('(with errno ENOENT)')).toBeGreaterThan(profile.indexOf('(subpath (param "JANISSARY_SKILL_0_L"))'));
  });

  // Narrower than the installation: ai/ is prompts written to be read by an agent, while the rest of
  // the tree holds janissary's own dependencies and working state.
  it('does not carve in the install root itself', () => {
    expect(dValues(build())).not.toContain(janissaryRoot());
  });

  it('sets the janissary install root, surviving the scrub', () => {
    const result = build({}, { PATH: '/usr/bin', NPM_TOKEN: 'ambient' });
    expect(result.env.janissary).toBe(janissaryRoot());
    expect(result.env.NPM_TOKEN).toBeUndefined();
  });

  it('scrubs credential-shaped vars and agent-socket escape vectors, keeping provider keys', () => {
    const env = {
      PATH: '/usr/bin',
      AWS_SECRET_ACCESS_KEY: 'x', GITHUB_TOKEN: 'x', GH_TOKEN: 'x', NPM_TOKEN: 'x',
      DOCKER_HOST: 'x', KUBECONFIG: 'x', SOME_SECRET: 'x', SOME_PASSWORD: 'x',
      SSH_AUTH_SOCK: 'x', GPG_AGENT_INFO: 'x', GIT_ASKPASS: 'x', GIT_CREDENTIAL_HELPER: 'x', KRB5CCNAME: 'x',
      ANTHROPIC_API_KEY: 'keep-me', OPENAI_API_KEY: 'keep-me', GOOGLE_API_KEY: 'keep-me',
      GEMINI_API_KEY: 'keep-me', GOOGLE_GENERATIVE_AI_API_KEY: 'keep-me', GOOGLE_VERTEX_PROJECT: 'keep-me',
      GOOGLE_APPLICATION_CREDENTIALS: 'keep-me', KILO_API_KEY: 'keep-me',
    };
    const result = build({}, env);
    for (const dropped of [
      'AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'NPM_TOKEN', 'DOCKER_HOST', 'KUBECONFIG',
      'SOME_SECRET', 'SOME_PASSWORD', 'SSH_AUTH_SOCK', 'GPG_AGENT_INFO', 'GIT_ASKPASS',
      'GIT_CREDENTIAL_HELPER', 'KRB5CCNAME',
    ]) {
      expect(result.env[dropped]).toBeUndefined();
    }
    // Since opencode's credential file became a denied secret path, these are the only route a
    // non-OpenCode provider has into a workspace, so a future scrub pattern swallowing one would
    // break authentication silently. GOOGLE_APPLICATION_CREDENTIALS is asserted for the opposite
    // reason: it survives too, which is exactly why a vertex setup looks configured and still
    // cannot authenticate — the file it names stays denied (see paths.ts).
    for (const kept of [
      'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY',
      'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_VERTEX_PROJECT',
      'GOOGLE_APPLICATION_CREDENTIALS', 'KILO_API_KEY',
    ]) {
      expect(result.env[kept]).toBe('keep-me');
    }
    expect(result.env.PATH).toBe('/usr/bin');
  });

  it('injects GH_TOKEN when a github token is configured, overriding the scrub', () => {
    const result = build({ tokens: { github: 'scoped-token' } }, { PATH: '/usr/bin', GH_TOKEN: 'ambient-token' });
    expect(result.env.GH_TOKEN).toBe('scoped-token');
  });

  it('does not set GH_TOKEN when no github token is configured, even if the ambient env has one', () => {
    const result = build({}, { PATH: '/usr/bin', GH_TOKEN: 'ambient-token' });
    expect(result.env.GH_TOKEN).toBeUndefined();
  });

  it('injects CLAUDE_CODE_OAUTH_TOKEN when a claude token is configured', () => {
    const result = build({ tokens: { claude: 'subscription-token' } }, { PATH: '/usr/bin' });
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('subscription-token');
  });

  // Unlike GH_TOKEN, this one is deliberately absent from ENV_SCRUB_PATTERNS: it is an LLM provider
  // credential, and the scrub exempts those so a harness can authenticate with its own. A user who
  // exports it themselves and configures no token file keeps working exactly as before.
  it('leaves an ambient CLAUDE_CODE_OAUTH_TOKEN in place when no claude token is configured', () => {
    const result = build({}, { PATH: '/usr/bin', CLAUDE_CODE_OAUTH_TOKEN: 'ambient-token' });
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('ambient-token');
  });

  it('prefers a configured claude token over an ambient CLAUDE_CODE_OAUTH_TOKEN', () => {
    const result = build({ tokens: { claude: 'configured-token' } }, { PATH: '/usr/bin', CLAUDE_CODE_OAUTH_TOKEN: 'ambient-token' });
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('configured-token');
  });

  it('injects OPENCODE_API_KEY when an opencode token is configured', () => {
    const result = build({ tokens: { opencode: 'oc_live_key' } }, { PATH: '/usr/bin' });
    expect(result.env.OPENCODE_API_KEY).toBe('oc_live_key');
  });

  // Off ENV_SCRUB_PATTERNS for the same reason the Claude token is: an LLM provider key, which the
  // scrub deliberately exempts so a harness can use its own.
  it('leaves an ambient OPENCODE_API_KEY in place when no opencode token is configured', () => {
    const result = build({}, { PATH: '/usr/bin', OPENCODE_API_KEY: 'ambient-key' });
    expect(result.env.OPENCODE_API_KEY).toBe('ambient-key');
  });

  it('injects KILO_API_KEY when a kilo token is configured', () => {
    const result = build({ tokens: { kilo: 'kilo_live_key' } }, { PATH: '/usr/bin' });
    expect(result.env.KILO_API_KEY).toBe('kilo_live_key');
  });

  // Off ENV_SCRUB_PATTERNS like the OpenCode key, so someone who exports it themselves keeps working
  // when no token file is configured.
  it('leaves an ambient KILO_API_KEY in place when no kilo token is configured', () => {
    const result = build({}, { PATH: '/usr/bin', KILO_API_KEY: 'ambient-key' });
    expect(result.env.KILO_API_KEY).toBe('ambient-key');
  });

  // Both names, because opencode detects its Google provider from one and loads the key from the
  // other: with only GEMINI_API_KEY set, the provider looked configured and the first prompt failed
  // reporting GOOGLE_GENERATIVE_AI_API_KEY missing.
  it('injects GEMINI_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY when a gemini token is configured', () => {
    const result = build({ tokens: { gemini: 'AIzaSyExample' } }, { PATH: '/usr/bin' });
    expect(result.env.GEMINI_API_KEY).toBe('AIzaSyExample');
    expect(result.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('AIzaSyExample');
  });

  // Off ENV_SCRUB_PATTERNS like the other two provider keys, so someone who exports it themselves
  // keeps working when no token file is configured.
  it('leaves an ambient GEMINI_API_KEY in place when no gemini token is configured', () => {
    const result = build({}, { PATH: '/usr/bin', GEMINI_API_KEY: 'ambient-key' });
    expect(result.env.GEMINI_API_KEY).toBe('ambient-key');
  });

  it('leaves an ambient GOOGLE_GENERATIVE_AI_API_KEY in place when no gemini token is configured', () => {
    const result = build({}, { PATH: '/usr/bin', GOOGLE_GENERATIVE_AI_API_KEY: 'ambient-key' });
    expect(result.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('ambient-key');
  });

  it('injects every credential when all five tokens are given', () => {
    mkdirSync(`${workspaceDir}.tmp`, { recursive: true });
    const result = build(
      {
        tokens: {
          github: 'scoped-token',
          claude: 'subscription-token',
          opencode: 'oc_live_key',
          kilo: 'kilo_live_key',
          gemini: 'AIzaSyExample',
        },
      },
      { PATH: '/usr/bin' },
    );
    expect(result.env.GH_TOKEN).toBe('scoped-token');
    expect(result.env.GH_CONFIG_DIR).toBe(path.join(realpathSync(`${workspaceDir}.tmp`), 'gh-config'));
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('subscription-token');
    expect(result.env.OPENCODE_API_KEY).toBe('oc_live_key');
    expect(result.env.KILO_API_KEY).toBe('kilo_live_key');
    expect(result.env.GEMINI_API_KEY).toBe('AIzaSyExample');
    expect(result.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('AIzaSyExample');
  });

  it('sets TMPDIR to the workspace-adjacent temp dir', () => {
    expect(build().env.TMPDIR).toContain(`${path.basename(workspaceDir)}.tmp`);
  });

  it('uses the offline profile variant when offline is set', () => {
    expect(build({ offline: true }).args[1]).toBe(SANDBOX_PROFILE_OFFLINE);
  });
});

// The identity is read from the module cache rather than from the options, so these set it directly
// and clear it afterwards — an identity left behind would change every other spawn in the suite.
describe('confinedHarnessSpawn git identity', () => {
  beforeEach(() => {
    setGitIdentity({ name: 'Ada Lovelace', email: 'ada@example.com' });
    return () => { setGitIdentity({}); };
  });

  it('injects the author and committer pair', () => {
    const result = build({}, { PATH: '/usr/bin' });
    expect(result.env.GIT_AUTHOR_NAME).toBe('Ada Lovelace');
    expect(result.env.GIT_COMMITTER_NAME).toBe('Ada Lovelace');
    expect(result.env.GIT_AUTHOR_EMAIL).toBe('ada@example.com');
    expect(result.env.GIT_COMMITTER_EMAIL).toBe('ada@example.com');
  });
});
