import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { setGitIdentity } from '../git-identity.js';
import { BROWSER_SANDBOX_PROFILE } from './browser-profile.js';
import {
  BROWSER_PORT_BAND_COUNT, BROWSER_PORT_BAND_FIRST, BROWSER_PORT_BAND_LAST,
} from './browser-ports.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';
import { SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE } from './profile.js';

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

const BROWSER_PATHS = {
  chromiumDir: '/pw/Chrome.app',
  appDir: '/app',
  appEntryDir: '/app/src',
  playwrightDirs: ['/app/node_modules/playwright', '/app/node_modules/playwright-core'],
};

function configureUnconfined(): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-off-'));
  mkdirSync(path.join(dir, '.janissary'), { recursive: true });
  writeFileSync(path.join(dir, '.janissary', 'config.json'), JSON.stringify({ sandboxWorkspaces: false }));
  loadConfig(dir);
}

function secretsIn(env: NodeJS.ProcessEnv): string[] {
  const forbidden = [
    ...Object.values(AMBIENT_SECRETS).filter((value) => value.startsWith('sentinel-')),
    ...Object.values(PROJECT_CREDENTIALS),
    'ada@example.com',
  ];
  const present = new Set(Object.values(env));
  return forbidden.filter((value) => present.has(value));
}

describe('sandbox browser spawning', () => {
  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-')));
    setGitIdentity({});
  });

  it('denies the whole browser port band after the general network rule', () => {
    for (const port of [BROWSER_PORT_BAND_FIRST, BROWSER_PORT_BAND_LAST]) {
      expect(SANDBOX_PROFILE).toContain(`(remote ip "localhost:${port}")`);
      expect(SANDBOX_PROFILE_OFFLINE).toContain(`(remote ip "localhost:${port}")`);
    }
    expect(SANDBOX_PROFILE).not.toContain(`(remote ip "localhost:${BROWSER_PORT_BAND_FIRST - 1}")`);
    expect(SANDBOX_PROFILE.match(/\(remote ip "localhost:\d+"\)/g)).toHaveLength(BROWSER_PORT_BAND_COUNT);
    expect(SANDBOX_PROFILE.indexOf('(deny network-outbound'))
      .toBeGreaterThan(SANDBOX_PROFILE.indexOf('(allow network*)'));
    expect(SANDBOX_PROFILE_OFFLINE.indexOf('(deny network-outbound'))
      .toBeGreaterThan(SANDBOX_PROFILE_OFFLINE.indexOf('(deny network*)'));
  });

  it('gives a spawn with no browser the same band-denying profile as any other', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const plain = sandboxSpawn({ workspaceDir }, 'bash', []);
    const offline = sandboxSpawn({ workspaceDir, offline: true }, 'bash', []);
    expect(plain.args[1]).toBe(SANDBOX_PROFILE);
    expect(offline.args[1]).toBe(SANDBOX_PROFILE_OFFLINE);
    for (const result of [plain, offline]) {
      expect(result.args[1]).toContain(`(remote ip "localhost:${BROWSER_PORT_BAND_FIRST}")`);
      expect(result.args.filter((_, index) => result.args[index - 1] === '-D').map((value) => value.split('=', 1)[0]))
        .not.toContain('BROWSER_ENDPOINT');
    }
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('binds the Playwright params to real directories for every sandboxed spawn', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', []);
    const dValues = new Map(result.args
      .filter((_, index) => result.args[index - 1] === '-D')
      .map((value) => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
    for (const param of ['PLAYWRIGHT_DIR', 'PLAYWRIGHT_CORE_DIR']) {
      const value = dValues.get(param);
      expect(value).toBeTruthy();
      expect(existsSync(value ?? '')).toBe(true);
    }
    expect(dValues.get('PLAYWRIGHT_DIR')).not.toBe(dValues.get('PLAYWRIGHT_CORE_DIR'));
    expect(SANDBOX_PROFILE).toContain('(subpath (param "PLAYWRIGHT_DIR"))');
    expect(SANDBOX_PROFILE).toContain('(subpath (param "PLAYWRIGHT_CORE_DIR"))');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('selects the browser profile and its own short param list', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, browser: BROWSER_PATHS }, 'node', ['main.js']);
    expect(result.args[0]).toBe('-p');
    expect(result.args[1]).toBe(BROWSER_SANDBOX_PROFILE);
    expect(result.args[1]).not.toBe(SANDBOX_PROFILE);
    const dNames = result.args.filter((_, index) => result.args[index - 1] === '-D')
      .map((value) => value.split('=', 1)[0]);
    expect(dNames).not.toContain('GIT_OBJECTS');
    expect(dNames).not.toContain('SELF_DIR_L');
    expect(dNames).not.toContain('PLAYWRIGHT_DIR');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('wraps a browser spawn when no harness workspace is in play', () => {
    if (!sandboxAvailable()) return;
    const scratchDir = mkdtempSync(path.join(tmpdir(), 'sandbox-browser-scratch-'));
    const result = sandboxSpawn({ workspaceDir: scratchDir, browser: BROWSER_PATHS }, 'node', ['main.js']);
    expect(result.command).toBe('sandbox-exec');
    expect(result.args[1]).toBe(BROWSER_SANDBOX_PROFILE);
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it('injects no credentials into a browser spawn', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn(
      { workspaceDir, browser: BROWSER_PATHS, tokens: { github: 'scoped-token' } },
      'node', ['main.js'], { PATH: '/usr/bin', NPM_TOKEN: 'ambient' },
    );
    expect(result.env.GH_TOKEN).toBeUndefined();
    expect(result.env.NPM_TOKEN).toBeUndefined();
    expect(result.env.TMPDIR).toBeTruthy();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('hands a browser no credentials when the host cannot confine it', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    setGitIdentity({ name: 'Ada', email: 'ada@example.com' });
    const result = sandboxSpawn(
      { workspaceDir, browser: BROWSER_PATHS, tokens: PROJECT_CREDENTIALS },
      'node', ['main.js'], AMBIENT_SECRETS,
    );
    expect(secretsIn(result.env)).toEqual([]);
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('gives an unconfined harness its credentials instead', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn(
      { workspaceDir, tokens: PROJECT_CREDENTIALS }, 'bash', ['-lc', 'git push'], AMBIENT_SECRETS,
    );
    expect(result.env.GH_TOKEN).toBe('scoped-github');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('keeps a browser usable while unconfined and returns its command unwrapped', () => {
    configureUnconfined();
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn(
      { workspaceDir, browser: BROWSER_PATHS }, 'node', ['main.js'],
      { ...AMBIENT_SECRETS, PLAYWRIGHT_BROWSERS_PATH: '/custom/browsers', NODE_OPTIONS: '--require=/tmp/evil.js' },
    );
    expect(result.command).toBe('node');
    expect(result.args).toEqual(['main.js']);
    expect(result.env.PATH).toBe('/usr/bin');
    expect(result.env.HOME).toBe('/home/ada');
    expect(result.env.TMPDIR).toBeTruthy();
    expect(result.env.PLAYWRIGHT_BROWSERS_PATH).toBe('/custom/browsers');
    expect(result.env.NODE_OPTIONS).toBeUndefined();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('hands a confined browser no provider keys either', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    setGitIdentity({ name: 'Ada', email: 'ada@example.com' });
    const result = sandboxSpawn(
      { workspaceDir, browser: BROWSER_PATHS, tokens: PROJECT_CREDENTIALS },
      'node', ['main.js'], AMBIENT_SECRETS,
    );
    expect(secretsIn(result.env)).toEqual([]);
    expect(result.env.TMPDIR).toBeTruthy();
    rmSync(workspaceDir, { recursive: true, force: true });
  });
});
