import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { setGitIdentity } from '../git-identity.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';
import { SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE } from './profile.js';
import { BROWSER_SANDBOX_PROFILE } from './browser-profile.js';

// A project whose config turns workspace isolation off — the same unconfined path a non-darwin
// remote takes, reachable from any platform the suite runs on.
function configureUnconfined(): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-off-'));
  mkdirSync(path.join(dir, '.janissary'), { recursive: true });
  writeFileSync(path.join(dir, '.janissary', 'config.json'), JSON.stringify({ sandboxWorkspaces: false }));
  loadConfig(dir);
}

// Sentinel values, one per class of secret a browser must never inherit: an ambient registry token,
// a cloud key, an agent socket, and the LLM provider keys `scrubEnv` deliberately exempts for the
// harnesses. Every value is distinctive enough to search the whole environment for.
const AMBIENT_SECRETS = {
  PATH: '/usr/bin',
  HOME: '/home/ada',
  NPM_TOKEN: 'sentinel-npm',
  AWS_SECRET_ACCESS_KEY: 'sentinel-aws',
  SSH_AUTH_SOCK: 'sentinel-ssh-agent',
  ANTHROPIC_API_KEY: 'sentinel-anthropic',
  OPENAI_API_KEY: 'sentinel-openai',
  GEMINI_API_KEY: 'sentinel-gemini',
};

const PROJECT_CREDENTIALS = {
  github: 'scoped-github', claude: 'scoped-claude', opencode: 'scoped-opencode', gemini: 'scoped-gemini',
};

// Which sentinels survived, found by value rather than by name — a credential arriving under a
// variable nobody thought to check is the failure worth catching. The git identity counts too: it is
// the user's real name and address, and the browser has no use for it.
function secretsIn(env: NodeJS.ProcessEnv): string[] {
  const forbidden = [
    ...Object.values(AMBIENT_SECRETS).filter((value) => value.startsWith('sentinel-')),
    ...Object.values(PROJECT_CREDENTIALS),
    'ada@example.com',
  ];
  const present = new Set(Object.values(env));
  return forbidden.filter((value) => present.has(value));
}

function parenDepth(text: string): number {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth;
}

describe('sandbox-profile constants', () => {
  it('SANDBOX_PROFILE and SANDBOX_PROFILE_OFFLINE have balanced parentheses', () => {
    expect(parenDepth(SANDBOX_PROFILE)).toBe(0);
    expect(parenDepth(SANDBOX_PROFILE_OFFLINE)).toBe(0);
  });

  it('the offline variant denies network, the default variant allows it', () => {
    expect(SANDBOX_PROFILE).toContain('(allow network*)');
    expect(SANDBOX_PROFILE).not.toContain('(deny network*)');
    expect(SANDBOX_PROFILE_OFFLINE).toContain('(deny network*)');
  });

  it('allows only UUID-shaped temporary siblings for atomic Claude configuration writes', () => {
    expect(SANDBOX_PROFILE).toContain(String.raw`(regex #"/\.claude\.json\.[0-9a-f-]+\.tmp$")`);
    expect(SANDBOX_PROFILE).not.toContain('(prefix (param "W');
  });
});

describe('sandboxSpawn', () => {
  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-')));
  });

  it('returns the input unchanged when workspaceDir is undefined', () => {
    const env = { PATH: '/usr/bin' };
    const result = sandboxSpawn({}, 'bash', ['-lc', 'echo hi'], env);
    expect(result).toEqual({ command: 'bash', args: ['-lc', 'echo hi'], env });
  });

  it('returns the input unchanged when sandboxWorkspaces is configured off', () => {
    configureUnconfined();
    const env = { PATH: '/usr/bin' };
    const result = sandboxSpawn({ workspaceDir: '/tmp/whatever' }, 'bash', ['-lc', 'echo hi'], env);
    expect(result).toEqual({ command: 'bash', args: ['-lc', 'echo hi'], env });
  });

  // A non-darwin remote and a host with the toggle off take the same unconfined path, and a
  // workspaced tab on either still pushes over HTTPS with `gh auth git-credential` — so the
  // credential has to arrive there too, even though nothing is being sandboxed.
  it('still injects the GitHub credential for a workspaced spawn when nothing is confined', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    mkdirSync(`${workspaceDir}.tmp`, { recursive: true });
    const result = sandboxSpawn({ workspaceDir, tokens: { github: 'scoped-token' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.command).toBe('bash');
    expect(result.env.GH_TOKEN).toBe('scoped-token');
    expect(result.env.GH_CONFIG_DIR).toBe(path.join(realpathSync(`${workspaceDir}.tmp`), 'gh-config'));
    rmSync(`${workspaceDir}.tmp`, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('leaves the rest of an unconfined environment alone rather than scrubbing it', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', SSH_AUTH_SOCK: '/tmp/agent.sock', NPM_TOKEN: 'ambient' };
    const result = sandboxSpawn({ workspaceDir, tokens: { github: 'scoped-token' } }, 'bash', [], env);
    expect(result.env.SSH_AUTH_SOCK).toBe('/tmp/agent.sock');
    expect(result.env.NPM_TOKEN).toBe('ambient');
    expect(result.env.PATH).toBe('/usr/bin');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('sets no GitHub credential on an unconfined spawn that has no workspaceDir', () => {
    configureUnconfined();
    const env = { PATH: '/usr/bin' };
    const result = sandboxSpawn({ tokens: { github: 'scoped-token' } }, 'bash', [], env);
    expect(result).toEqual({ command: 'bash', args: [], env });
  });

  // A workspaced claude harness on a host that cannot confine anything — a Linux remote, most
  // commonly — is exactly the case the token file exists for: no Keychain, and its own credentials
  // file denied. The credential has to reach it there too.
  it('still injects the Claude credential for a workspaced spawn when nothing is confined', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, tokens: { claude: 'subscription-token' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.command).toBe('bash');
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('subscription-token');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('sets no Claude credential on an unconfined spawn that has no workspaceDir', () => {
    configureUnconfined();
    const env = { PATH: '/usr/bin' };
    const result = sandboxSpawn({ tokens: { claude: 'subscription-token' } }, 'bash', [], env);
    expect(result).toEqual({ command: 'bash', args: [], env });
  });

  it('wraps the command in sandbox-exec when a workspaceDir is given and sandboxing is available', () => {
    if (!sandboxAvailable()) return; // covered by the identity-passthrough case elsewhere
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', ['-lc', 'echo hi']);
    expect(result.command).toBe('sandbox-exec');
    expect(result.args[0]).toBe('-p');
    expect(result.args).toContain('--');
    const tail = result.args.slice(result.args.indexOf('--') + 1);
    expect(tail).toEqual(['bash', '-lc', 'echo hi']);
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('includes every -D param the profile references', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', []);
    const dNames = result.args.filter((_, i) => result.args[i - 1] === '-D').map((v) => v.split('=', 1)[0]);
    for (const required of ['WORKSPACE', 'TMPDIR', 'HOME', 'GIT_OBJECTS']) {
      expect(dNames).toContain(required);
    }
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // The Playwright carve-in is unconditional rather than gated on `-b`: gating it would mean
  // threading a field through SandboxOptions, spawnPty, and the remote's spawn path to withhold read
  // access to two directories of janissary's own dependency tree that hold no user data.
  it('binds the Playwright params to real directories for every sandboxed spawn, -b or not', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', []);
    const dValues = new Map(result.args
      .filter((_, i) => result.args[i - 1] === '-D')
      .map((v) => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)]));
    for (const param of ['PLAYWRIGHT_DIR', 'PLAYWRIGHT_CORE_DIR']) {
      const value = dValues.get(param);
      expect(value).toBeTruthy();
      expect(existsSync(value ?? '')).toBe(true);
    }
    // Resolved separately, not assumed nested: in a hoisted layout playwright-core is a sibling.
    expect(dValues.get('PLAYWRIGHT_DIR')).not.toBe(dValues.get('PLAYWRIGHT_CORE_DIR'));
    expect(SANDBOX_PROFILE).toContain('(subpath (param "PLAYWRIGHT_DIR"))');
    expect(SANDBOX_PROFILE).toContain('(subpath (param "PLAYWRIGHT_CORE_DIR"))');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('selects the browser profile, and its own short param list, for a browser spawn', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn(
      { workspaceDir, browser: { chromiumDir: '/pw/Chrome.app', appDir: '/app' } }, 'node', ['main.js'],
    );
    expect(result.args[0]).toBe('-p');
    expect(result.args[1]).toBe(BROWSER_SANDBOX_PROFILE);
    expect(result.args[1]).not.toBe(SANDBOX_PROFILE);
    const dNames = result.args.filter((_, i) => result.args[i - 1] === '-D').map((v) => v.split('=', 1)[0]);
    // The harness spawn's tables never reach the browser profile — it does not name them and must
    // not learn about them.
    expect(dNames).not.toContain('GIT_OBJECTS');
    expect(dNames).not.toContain('SELF_DIR_L');
    expect(dNames).not.toContain('PLAYWRIGHT_DIR');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // The browser child authenticates to nothing and pushes nowhere, so none of the credential
  // injection a harness spawn gets applies to it.
  it('injects no credentials into a browser spawn', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn(
      { workspaceDir, browser: { chromiumDir: '/pw/Chrome.app', appDir: '/app' }, tokens: { github: 'scoped-token' } },
      'node', ['main.js'], { PATH: '/usr/bin', NPM_TOKEN: 'ambient' },
    );
    expect(result.env.GH_TOKEN).toBeUndefined();
    expect(result.env.NPM_TOKEN).toBeUndefined();
    expect(result.env.TMPDIR).toBeTruthy();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // The unconfined fallback — a non-darwin remote, or `sandboxWorkspaces` off. This is the case
  // that had no coverage at all: the browser branch used to sit *inside* the confined path, so the
  // browser was handed the server's whole environment on exactly the hosts with no Seatbelt behind
  // it, and the test above skips there.
  it('hands a browser no credentials when the host cannot confine it', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    setGitIdentity({ name: 'Ada', email: 'ada@example.com' });
    const result = sandboxSpawn(
      { workspaceDir, browser: { chromiumDir: '/pw/Chrome.app', appDir: '/app' }, tokens: PROJECT_CREDENTIALS },
      'node', ['main.js'], AMBIENT_SECRETS,
    );
    // Asserted over the values, not by naming keys: a credential that arrives under a variable
    // nobody thought to check is exactly the failure this is meant to catch.
    expect(secretsIn(result.env)).toEqual([]);
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('gives an unconfined harness its credentials, so it is the browser and not the host that decides', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn(
      { workspaceDir, tokens: PROJECT_CREDENTIALS }, 'bash', ['-lc', 'git push'], AMBIENT_SECRETS,
    );
    expect(result.env.GH_TOKEN).toBe('scoped-github');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('keeps a browser usable while unconfined, and returns its command unwrapped', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn(
      { workspaceDir, browser: { chromiumDir: '/pw/Chrome.app', appDir: '/app' } }, 'node', ['main.js'],
      { ...AMBIENT_SECRETS, PLAYWRIGHT_BROWSERS_PATH: '/custom/browsers', NODE_OPTIONS: '--require=/tmp/evil.js' },
    );
    expect(result.command).toBe('node');
    expect(result.args).toEqual(['main.js']);
    expect(result.env.PATH).toBe('/usr/bin');
    expect(result.env.HOME).toBe('/home/ada');
    expect(result.env.TMPDIR).toBeTruthy();
    // Needed, or `executablePath()` cannot find a relocated bundle.
    expect(result.env.PLAYWRIGHT_BROWSERS_PATH).toBe('/custom/browsers');
    // Not needed, and it would let ambient configuration inject a module into the child.
    expect(result.env.NODE_OPTIONS).toBeUndefined();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // The confined path inherited provider keys too: `scrubEnv` is a denylist that deliberately
  // exempts them, because a harness needs its own credentials. A browser does not.
  it('hands a confined browser no provider keys either', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    setGitIdentity({ name: 'Ada', email: 'ada@example.com' });
    const result = sandboxSpawn(
      { workspaceDir, browser: { chromiumDir: '/pw/Chrome.app', appDir: '/app' }, tokens: PROJECT_CREDENTIALS },
      'node', ['main.js'], AMBIENT_SECRETS,
    );
    expect(secretsIn(result.env)).toEqual([]);
    expect(result.env.TMPDIR).toBeTruthy();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // The one secret-deny entry that overrides a carve-in rather than backing up a denial the tables
  // already imply: `.local/share/opencode` is a write carve-out (and so a read carve-in), and the
  // credential file inside it has to lose anyway. Both halves are asserted here — the deny reaches
  // the profile, and denying it did not deny the directory the harness writes its database to.
  it('binds a secret-deny param to opencode\'s credential file without denying its directory', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', []);
    const dValues = result.args.filter((_, i) => result.args[i - 1] === '-D').map((v) => v.slice(v.indexOf('=') + 1));
    expect(dValues).toContain(path.join(realpathSync(homedir()), '.local/share/opencode/auth.json'));
    expect(dValues).toContain(path.join(realpathSync(homedir()), '.local/share/opencode'));
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // opencode's cached model catalog is readable so a workspaced harness sees the same model list
  // the non-sandboxed opencode has already fetched. Asserted alongside the directories it must NOT
  // have widened into: carving in the cache tree itself would let a sandboxed agent read (and, if
  // it were ever also a write carve-out) forge anything else opencode caches there.
  it('binds a read-carvein param to opencode\'s model cache without carving in its directory', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', []);
    const dValues = result.args.filter((_, i) => result.args[i - 1] === '-D').map((v) => v.slice(v.indexOf('=') + 1));
    const home = realpathSync(homedir());
    expect(dValues).toContain(path.join(home, '.cache/opencode/models.json'));
    expect(dValues).not.toContain(path.join(home, '.cache/opencode'));
    expect(dValues).not.toContain(path.join(home, '.cache'));
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('scrubs credential-shaped vars and agent-socket escape vectors, keeping provider keys', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = {
      PATH: '/usr/bin',
      AWS_SECRET_ACCESS_KEY: 'x', GITHUB_TOKEN: 'x', GH_TOKEN: 'x', NPM_TOKEN: 'x',
      DOCKER_HOST: 'x', KUBECONFIG: 'x', SOME_SECRET: 'x', SOME_PASSWORD: 'x',
      SSH_AUTH_SOCK: 'x', GPG_AGENT_INFO: 'x', GIT_ASKPASS: 'x', GIT_CREDENTIAL_HELPER: 'x', KRB5CCNAME: 'x',
      ANTHROPIC_API_KEY: 'keep-me', OPENAI_API_KEY: 'keep-me', GOOGLE_API_KEY: 'keep-me',
      GEMINI_API_KEY: 'keep-me', GOOGLE_GENERATIVE_AI_API_KEY: 'keep-me', GOOGLE_VERTEX_PROJECT: 'keep-me',
      GOOGLE_APPLICATION_CREDENTIALS: 'keep-me',
    };
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], env);
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
      'GOOGLE_APPLICATION_CREDENTIALS',
    ]) {
      expect(result.env[kept]).toBe('keep-me');
    }
    expect(result.env.PATH).toBe('/usr/bin');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('injects GH_TOKEN when a github token is configured, overriding the scrub', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', GH_TOKEN: 'ambient-token' };
    const result = sandboxSpawn({ workspaceDir, tokens: { github: 'scoped-token' } }, 'bash', [], env);
    expect(result.env.GH_TOKEN).toBe('scoped-token');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('does not set GH_TOKEN when no github token is configured, even if the ambient env has one', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', GH_TOKEN: 'ambient-token' };
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], env);
    expect(result.env.GH_TOKEN).toBeUndefined();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('injects CLAUDE_CODE_OAUTH_TOKEN when a claude token is configured', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, tokens: { claude: 'subscription-token' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('subscription-token');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // Unlike GH_TOKEN, this one is deliberately absent from ENV_SCRUB_PATTERNS: it is an LLM provider
  // credential, and the scrub exempts those so a harness can authenticate with its own. A user who
  // exports it themselves and configures no token file keeps working exactly as before.
  it('leaves an ambient CLAUDE_CODE_OAUTH_TOKEN in place when no claude token is configured', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', CLAUDE_CODE_OAUTH_TOKEN: 'ambient-token' };
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], env);
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('ambient-token');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('prefers a configured claude token over an ambient CLAUDE_CODE_OAUTH_TOKEN', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', CLAUDE_CODE_OAUTH_TOKEN: 'ambient-token' };
    const result = sandboxSpawn({ workspaceDir, tokens: { claude: 'configured-token' } }, 'bash', [], env);
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('configured-token');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('injects OPENCODE_API_KEY when an opencode token is configured', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, tokens: { opencode: 'oc_live_key' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.env.OPENCODE_API_KEY).toBe('oc_live_key');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // Off ENV_SCRUB_PATTERNS for the same reason the Claude token is: an LLM provider key, which the
  // scrub deliberately exempts so a harness can use its own.
  it('leaves an ambient OPENCODE_API_KEY in place when no opencode token is configured', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', OPENCODE_API_KEY: 'ambient-key' };
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], env);
    expect(result.env.OPENCODE_API_KEY).toBe('ambient-key');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('still injects the OpenCode credential for a workspaced spawn when nothing is confined', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, tokens: { opencode: 'oc_live_key' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.command).toBe('bash');
    expect(result.env.OPENCODE_API_KEY).toBe('oc_live_key');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // Both names, because opencode detects its Google provider from one and loads the key from the
  // other: with only GEMINI_API_KEY set, the provider looked configured and the first prompt failed
  // reporting GOOGLE_GENERATIVE_AI_API_KEY missing.
  it('injects GEMINI_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY when a gemini token is configured', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, tokens: { gemini: 'AIzaSyExample' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.env.GEMINI_API_KEY).toBe('AIzaSyExample');
    expect(result.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('AIzaSyExample');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // Off ENV_SCRUB_PATTERNS like the other two provider keys, so someone who exports it themselves
  // keeps working when no token file is configured.
  it('leaves an ambient GEMINI_API_KEY in place when no gemini token is configured', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', GEMINI_API_KEY: 'ambient-key' };
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], env);
    expect(result.env.GEMINI_API_KEY).toBe('ambient-key');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('leaves an ambient GOOGLE_GENERATIVE_AI_API_KEY in place when no gemini token is configured', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', GOOGLE_GENERATIVE_AI_API_KEY: 'ambient-key' };
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], env);
    expect(result.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('ambient-key');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('still injects both Gemini variables for a workspaced spawn when nothing is confined', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, tokens: { gemini: 'AIzaSyExample' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.command).toBe('bash');
    expect(result.env.GEMINI_API_KEY).toBe('AIzaSyExample');
    expect(result.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('AIzaSyExample');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('injects every credential when all four tokens are given', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    mkdirSync(`${workspaceDir}.tmp`, { recursive: true });
    const result = sandboxSpawn(
      {
        workspaceDir,
        tokens: {
          github: 'scoped-token',
          claude: 'subscription-token',
          opencode: 'oc_live_key',
          gemini: 'AIzaSyExample',
        },
      },
      'bash', [], { PATH: '/usr/bin' },
    );
    expect(result.env.GH_TOKEN).toBe('scoped-token');
    expect(result.env.GH_CONFIG_DIR).toBe(path.join(realpathSync(`${workspaceDir}.tmp`), 'gh-config'));
    expect(result.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('subscription-token');
    expect(result.env.OPENCODE_API_KEY).toBe('oc_live_key');
    expect(result.env.GEMINI_API_KEY).toBe('AIzaSyExample');
    expect(result.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('AIzaSyExample');
    rmSync(`${workspaceDir}.tmp`, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('sets TMPDIR to the workspace-adjacent temp dir', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', []);
    expect(result.env.TMPDIR).toContain(`${path.basename(workspaceDir)}.tmp`);
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('uses the offline profile variant when offline is set', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, offline: true }, 'bash', []);
    expect(result.args[1]).toBe(SANDBOX_PROFILE_OFFLINE);
    rmSync(workspaceDir, { recursive: true, force: true });
  });
});

// The identity is read from the module cache rather than from `SandboxOptions`, so these set it
// directly and clear it afterwards — an identity left behind would change every other spawn in the
// suite, which is the same reason the injection is gated on `workspaceDir`.
describe('sandboxSpawn git identity', () => {
  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-')));
    setGitIdentity({ name: 'Ada Lovelace', email: 'ada@example.com' });
    return () => { setGitIdentity({}); };
  });

  it('injects the author and committer pair on a confined workspaced spawn', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.env.GIT_AUTHOR_NAME).toBe('Ada Lovelace');
    expect(result.env.GIT_COMMITTER_NAME).toBe('Ada Lovelace');
    expect(result.env.GIT_AUTHOR_EMAIL).toBe('ada@example.com');
    expect(result.env.GIT_COMMITTER_EMAIL).toBe('ada@example.com');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // A remote workspace on a Linux host takes the unconfined path, and that is precisely where the
  // machine's own git config is the wrong user's — so the identity has to arrive there too.
  it('injects it for a workspaced spawn when nothing is confined', () => {
    configureUnconfined();
    setGitIdentity({ name: 'Ada Lovelace', email: 'ada@example.com' });
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.command).toBe('bash');
    expect(result.env.GIT_AUTHOR_NAME).toBe('Ada Lovelace');
    expect(result.env.GIT_COMMITTER_EMAIL).toBe('ada@example.com');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('injects nothing on a spawn that has no workspaceDir', () => {
    configureUnconfined();
    setGitIdentity({ name: 'Ada Lovelace', email: 'ada@example.com' });
    const env = { PATH: '/usr/bin' };
    expect(sandboxSpawn({}, 'bash', [], env)).toEqual({ command: 'bash', args: [], env });
  });

  // The user who opened janissary is the author, not whoever the spawning environment names.
  it('overrides an ambient author already in the environment', () => {
    configureUnconfined();
    setGitIdentity({ name: 'Ada Lovelace', email: 'ada@example.com' });
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], { GIT_AUTHOR_NAME: 'build-bot' });
    expect(result.env.GIT_AUTHOR_NAME).toBe('Ada Lovelace');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('injects nothing for a workspaced spawn when no identity has been loaded', () => {
    configureUnconfined();
    setGitIdentity({});
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin' };
    expect(sandboxSpawn({ workspaceDir }, 'bash', [], env)).toEqual({ command: 'bash', args: [], env });
    rmSync(workspaceDir, { recursive: true, force: true });
  });
});
