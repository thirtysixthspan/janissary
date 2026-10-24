import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { setGitIdentity } from '../git/identity.js';
import { janissaryRoot } from '../janissary-root.js';
import { sandboxSpawn } from './index.js';
import { sandboxAvailable, shouldConfineWorkspace } from './confinement.js';
import { SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE } from './profile.js';

// A project whose config turns workspace isolation off — the same unconfined path a non-darwin
// remote takes, reachable from any platform the suite runs on.
function configureUnconfined(): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-off-'));
  mkdirSync(path.join(dir, '.janissary'), { recursive: true });
  writeFileSync(path.join(dir, '.janissary', 'config.json'), JSON.stringify({ sandboxWorkspaces: false }));
  loadConfig(dir);
}

// What a pass-through spawn's environment looks like: the caller's own, plus the janissary install
// root, which is added on every path because the task picker inserts the same `$janissary` command
// whether or not the tab it populates is workspaced.
function passedThrough(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, janissary: janissaryRoot() };
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
  it('all harness profiles have balanced parentheses', () => {
    for (const profile of [SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE]) expect(parenDepth(profile)).toBe(0);
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

  it('passes the command and args through unchanged when workspaceDir is undefined', () => {
    const env = { PATH: '/usr/bin' };
    const result = sandboxSpawn({}, 'bash', ['-lc', 'echo hi'], env);
    expect(result).toEqual({ command: 'bash', args: ['-lc', 'echo hi'], env: passedThrough(env) });
  });

  it('passes the command and args through unchanged when sandboxWorkspaces is configured off', () => {
    configureUnconfined();
    const env = { PATH: '/usr/bin' };
    const result = sandboxSpawn({ workspaceDir: '/tmp/whatever' }, 'bash', ['-lc', 'echo hi'], env);
    expect(result).toEqual({ command: 'bash', args: ['-lc', 'echo hi'], env: passedThrough(env) });
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
    expect(result).toEqual({ command: 'bash', args: [], env: passedThrough(env) });
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
    expect(result).toEqual({ command: 'bash', args: [], env: passedThrough(env) });
  });

  it.skipIf(!sandboxAvailable())('wraps the command in sandbox-exec when a workspaceDir is given and sandboxing is available', () => {
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', ['-lc', 'echo hi']);
    expect(result.command).toBe('sandbox-exec');
    expect(result.args[0]).toBe('-p');
    expect(result.args).toContain('--');
    const tail = result.args.slice(result.args.indexOf('--') + 1);
    expect(tail).toEqual(['bash', '-lc', 'echo hi']);
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('sets the janissary install root on an unconfined workspaced spawn too', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.env.janissary).toBe(janissaryRoot());
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  // The picker inserts the same command on any tab and cannot know which are workspaced, so a plain
  // tab needs the variable as much as a confined one does.
  it('sets the janissary install root on a spawn with no workspaceDir at all', () => {
    const result = sandboxSpawn({}, 'bash', [], { PATH: '/usr/bin' });
    expect(result.env.janissary).toBe(janissaryRoot());
  });

  it('still injects the OpenCode credential for a workspaced spawn when nothing is confined', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, tokens: { opencode: 'oc_live_key' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.command).toBe('bash');
    expect(result.env.OPENCODE_API_KEY).toBe('oc_live_key');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('still injects the Kilo credential for a workspaced spawn when nothing is confined', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, tokens: { kilo: 'kilo_live_key' } }, 'bash', [], { PATH: '/usr/bin' });
    expect(result.command).toBe('bash');
    expect(result.env.KILO_API_KEY).toBe('kilo_live_key');
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

});

describe('workspace confinement decision', () => {
  it.each([
    { state: 'enabled and available', workspace: true, enabled: true, available: true, expected: true },
    { state: 'disabled by config', workspace: true, enabled: false, available: true, expected: false },
    { state: 'unavailable on host', workspace: true, enabled: true, available: false, expected: false },
    { state: 'missing workspace', workspace: false, enabled: true, available: true, expected: false },
  ])('reports confinement when $state', ({ workspace, enabled, available, expected }) => {
    expect(shouldConfineWorkspace(workspace, enabled, available)).toBe(expected);
  });

  it('reports the same decision sandboxSpawn uses for a local workspace', () => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-')));
    expect(shouldConfineWorkspace(true, true, sandboxAvailable())).toBe(sandboxAvailable());
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
    expect(sandboxSpawn({}, 'bash', [], env)).toEqual({ command: 'bash', args: [], env: passedThrough(env) });
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
    expect(sandboxSpawn({ workspaceDir }, 'bash', [], env)).toEqual({ command: 'bash', args: [], env: passedThrough(env) });
    rmSync(workspaceDir, { recursive: true, force: true });
  });
});
