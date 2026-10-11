import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { loadOpencodeOauth } from '../project/opencode-oauth.js';
import { createWorkspaceScratch } from '../workspace/scratch.js';
import { sandboxSpawn } from './index.js';
import { prepareOpencodeDataHome, workspaceOpencodeDataHome } from './opencode-data.js';

let root: string;
let workspace: string;
let scratch: string;
let dataHome: string;
let host: string;

beforeEach(() => {
  mkdirSync('temp', { recursive: true });
  root = realpathSync(mkdtempSync(path.join(process.cwd(), 'temp', 'oauth-boundary-')));
  workspace = path.join(root, 'workspace');
  scratch = `${workspace}.tmp`;
  dataHome = path.join(scratch, 'opencode-data');
  host = path.join(root, 'host');
  mkdirSync(host);
  writeFileSync(path.join(host, 'auth.json'), 'host-original');
  mkdirSync(path.join(root, '.codex'));
  writeFileSync(path.join(root, '.codex', 'auth.json'), JSON.stringify({ tokens: {
    access_token: `header.${Buffer.from('{"exp":1800000000}').toString('base64url')}.signature`,
    refresh_token: 'test-refresh', account_id: 'test-account',
  } }));
  loadOpencodeOauth(root);
  mkdirSync(path.join(root, '.janissary'));
  writeFileSync(path.join(root, '.janissary', 'config.json'), '{"sandboxWorkspaces":false}');
  loadConfig(root);
});

afterEach(() => {
  loadOpencodeOauth(path.join(root, 'absent'));
  rmSync(root, { recursive: true, force: true });
});

describe('OAuth provisioning boundary', () => {
  it.each(['directory', 'symlink'])('refuses an existing scratch %s before writing credentials', (kind) => {
    if (kind === 'directory') mkdirSync(scratch);
    else symlinkSync(host, scratch);
    expect(() => createWorkspaceScratch(workspace)).toThrow();
    expect(readFileSync(path.join(host, 'auth.json'), 'utf8')).toBe('host-original');
    expect(readdirSync(host)).toEqual(['auth.json']);
  });

  it.each(['scratch', 'data', 'opencode', 'auth'])('rejects a symlink at the %s component during lookup and later spawns', (component) => {
    createWorkspaceScratch(workspace);
    const locations: Record<string, string> = {
      scratch, data: dataHome, opencode: path.join(dataHome, 'opencode'), auth: path.join(dataHome, 'opencode', 'auth.json'),
    };
    const location = locations[component]!;
    rmSync(location, { recursive: true, force: true });
    symlinkSync(component === 'auth' ? path.join(host, 'auth.json') : host, location);
    expect(workspaceOpencodeDataHome(workspace)).toBeUndefined();
    const result = sandboxSpawn({ workspaceDir: workspace }, 'opencode', [], { PATH: '/usr/bin' });
    expect(result.env.XDG_DATA_HOME).toBeUndefined();
    expect(readFileSync(path.join(host, 'auth.json'), 'utf8')).toBe('host-original');
    expect(readdirSync(host)).toEqual(['auth.json']);
    if (component === 'scratch') expect(() => prepareOpencodeDataHome(scratch)).toThrow();
    else expect(prepareOpencodeDataHome(scratch)).toBeUndefined();
    expect(readdirSync(host)).toEqual(['auth.json']);
  });

  it('rejects a broken auth symlink without creating its target', () => {
    createWorkspaceScratch(workspace);
    const file = path.join(dataHome, 'opencode', 'auth.json');
    const target = path.join(host, 'missing.json');
    rmSync(file);
    symlinkSync(target, file);
    expect(workspaceOpencodeDataHome(workspace)).toBeUndefined();
    expect(prepareOpencodeDataHome(scratch)).toBeUndefined();
    expect(existsSync(target)).toBe(false);
  });

  it('does not re-seed credentials after a child removes the whole data directory', () => {
    createWorkspaceScratch(workspace);
    rmSync(dataHome, { recursive: true });
    sandboxSpawn({ workspaceDir: workspace }, 'opencode', [], { PATH: '/usr/bin' });
    expect(existsSync(dataHome)).toBe(false);
  });
});
