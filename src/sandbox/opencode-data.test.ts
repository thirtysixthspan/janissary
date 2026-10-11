import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { getOpencodeOauth, loadOpencodeOauth } from '../project/opencode-oauth.js';
import { loadProjectTokens } from '../project/tokens.js';
import { initWorkspaceDir, removeWorkspace } from '../workspace/index.js';
import { createWorkspaceScratch } from '../workspace/scratch.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';
import { prepareOpencodeDataHome, workspaceOpencodeDataHome } from './opencode-data.js';

let root: string;
let home: string;
let workspaceDir: string;
let dataHome: string;
let file: string;

beforeEach(() => {
  mkdirSync('temp', { recursive: true });
  root = realpathSync(mkdtempSync(path.join(process.cwd(), 'temp', 'opencode-data-')));
  home = path.join(root, 'home');
  workspaceDir = path.join(root, 'workspace');
  dataHome = path.join(`${workspaceDir}.tmp`, 'opencode-data');
  file = path.join(dataHome, 'opencode', 'auth.json');
  mkdirSync(path.join(home, '.codex'), { recursive: true });
  mkdirSync(workspaceDir);
  writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({
    tokens: {
      access_token: `header.${Buffer.from('{"exp":1800000000}').toString('base64url')}.signature`,
      refresh_token: 'test-refresh', account_id: 'test-account',
    },
  }));
  vi.stubEnv('HOME', home);
  loadProjectTokens(root, home);
});

afterEach(() => {
  loadOpencodeOauth(path.join(root, 'absent'));
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function configure(isolation: boolean): void {
  mkdirSync(path.join(root, '.janissary'), { recursive: true });
  writeFileSync(path.join(root, '.janissary', 'config.json'), JSON.stringify({ sandboxWorkspaces: isolation }));
  loadConfig(root);
}

describe('OpenCode workspace OAuth', () => {
  it.each([false, true])('seeds private auth and redirects launches with isolation %s', (isolation) => {
    configure(isolation);
    createWorkspaceScratch(workspaceDir);
    const result = sandboxSpawn({ workspaceDir, tokens: { opencode: 'test-key' } }, 'opencode', [], { PATH: '/usr/bin' });
    expect(result.command).toBe(isolation && sandboxAvailable() ? 'sandbox-exec' : 'opencode');
    expect(result.env.XDG_DATA_HOME).toBe(dataHome);
    expect(result.env.OPENCODE_API_KEY).toBe('test-key');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ openai: getOpencodeOauth() });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(file.startsWith(`${workspaceDir}${path.sep}`)).toBe(false);
    expect(workspaceOpencodeDataHome(workspaceDir)).toBe(dataHome);
  });

  it('preserves refreshed private credentials across later launches and credential reloads', () => {
    configure(false);
    createWorkspaceScratch(workspaceDir);
    sandboxSpawn({ workspaceDir }, 'opencode', []);
    const refreshed = JSON.stringify({ openai: { ...getOpencodeOauth(), refresh: 'refreshed-token' } });
    writeFileSync(file, refreshed);
    loadOpencodeOauth(path.join(root, 'absent'));
    expect(sandboxSpawn({ workspaceDir }, 'opencode', []).env.XDG_DATA_HOME).toBe(dataHome);
    expect(readFileSync(file, 'utf8')).toBe(refreshed);
  });

  it('leaves ambient data-home settings unchanged when no valid login is loaded', () => {
    configure(false);
    loadOpencodeOauth(path.join(root, 'absent'));
    const result = sandboxSpawn({ workspaceDir }, 'opencode', [], { XDG_DATA_HOME: 'ambient-data' });
    expect(result.env.XDG_DATA_HOME).toBe('ambient-data');
    expect(existsSync(file)).toBe(false);
    expect(workspaceOpencodeDataHome(workspaceDir)).toBeUndefined();
  });

  it('does not redirect or copy credentials for non-workspaced processes', () => {
    configure(false);
    expect(sandboxSpawn({}, 'opencode', []).env.XDG_DATA_HOME).toBe(process.env.XDG_DATA_HOME);
    expect(existsSync(file)).toBe(false);
    expect(workspaceOpencodeDataHome(undefined)).toBeUndefined();
  });

  it('does not provision OAuth or export its data home to a browser child', () => {
    configure(false);
    const browser = { chromiumDir: root, appDir: root, appEntryDir: root, playwrightDirs: [root] };
    const result = sandboxSpawn({ workspaceDir, browser }, 'node', [], { XDG_DATA_HOME: dataHome });
    expect(result.env.XDG_DATA_HOME).toBeUndefined();
    expect(existsSync(file)).toBe(false);
  });

  it('gives separate workspaces separate credential copies', () => {
    createWorkspaceScratch(workspaceDir);
    mkdirSync(path.join(root, 'second.tmp'));
    const second = prepareOpencodeDataHome(path.join(root, 'second.tmp'));
    expect(second).not.toBe(dataHome);
    expect(JSON.parse(readFileSync(path.join(second!, 'opencode', 'auth.json'), 'utf8'))).toEqual({ openai: getOpencodeOauth() });
  });

  it('removes the private credentials with the workspace temporary directory', () => {
    createWorkspaceScratch(workspaceDir);
    initWorkspaceDir(root, path.join(home, '.claude.json'));
    removeWorkspace(workspaceDir);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(`${workspaceDir}.tmp`)).toBe(false);
  });
});
