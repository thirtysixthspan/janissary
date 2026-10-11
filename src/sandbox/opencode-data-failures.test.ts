import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { loadOpencodeOauth } from '../project/opencode-oauth.js';
import { createWorkspaceScratch } from '../workspace/scratch.js';
import { OPENCODE_OAUTH_FAILURE_NOTICE, prepareOpencodeData } from './opencode-data.js';
import { sandboxSpawn } from './index.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, mkdirSync: vi.fn(actual.mkdirSync), writeFileSync: vi.fn(actual.writeFileSync) };
});

let root: string;
let scratch: string;
let dataHome: string;

beforeEach(() => {
  fs.mkdirSync('temp', { recursive: true });
  root = fs.realpathSync(fs.mkdtempSync(path.join(process.cwd(), 'temp', 'oauth-failure-')));
  scratch = path.join(root, 'workspace.tmp');
  dataHome = path.join(scratch, 'opencode-data');
  fs.mkdirSync(scratch);
  fs.mkdirSync(path.join(root, '.codex'));
  fs.writeFileSync(path.join(root, '.codex', 'auth.json'), JSON.stringify({ tokens: {
    access_token: `header.${Buffer.from('{"exp":1800000000}').toString('base64url')}.signature`,
    refresh_token: 'test-refresh', account_id: 'test-account',
  } }));
  loadOpencodeOauth(root);
  fs.mkdirSync(path.join(root, '.janissary'));
  fs.writeFileSync(path.join(root, '.janissary', 'config.json'), '{"sandboxWorkspaces":false}');
  loadConfig(root);
});

afterEach(() => {
  loadOpencodeOauth(path.join(root, 'absent'));
  fs.rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

function failPartialWrite(): void {
  vi.mocked(fs.writeFileSync).mockImplementationOnce((file) => {
    fs.writeSync(file as number, '{"openai":');
    throw new Error('test-refresh-secret');
  });
}

describe('optional OAuth preparation', () => {
  it('reports a regular-file collision as unsafe without modifying it', () => {
    fs.writeFileSync(dataHome, 'keep-this-file');
    expect(prepareOpencodeData(scratch)).toEqual({ type: 'failed', reason: 'unsafe' });
    expect(fs.readFileSync(dataHome, 'utf8')).toBe('keep-this-file');
  });

  it('returns a bounded failure when directory creation fails', () => {
    vi.mocked(fs.mkdirSync).mockImplementationOnce(() => { throw new Error('private-value'); });
    expect(prepareOpencodeData(scratch)).toEqual({ type: 'failed', reason: 'storage' });
    expect(fs.existsSync(dataHome)).toBe(false);
  });

  it('does not publish a partial credential and removes failed staging', () => {
    failPartialWrite();
    expect(prepareOpencodeData(scratch)).toEqual({ type: 'failed', reason: 'storage' });
    expect(fs.existsSync(dataHome)).toBe(false);
  });

  it('allows a later legitimate preparation after failed staging', () => {
    failPartialWrite();
    expect(prepareOpencodeData(scratch).type).toBe('failed');
    expect(prepareOpencodeData(scratch)).toEqual({ type: 'available', dataHome });
    expect(fs.existsSync(path.join(dataHome, 'opencode', '.auth-seed'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dataHome, 'opencode', 'auth.json'), 'utf8')).openai.accountId).toBe('test-account');
  });

  it.each(['bash', 'claude'])('retains %s launch behavior and API keys after optional staging fails', (command) => {
    const workspace = path.join(root, 'new-workspace');
    failPartialWrite();
    expect(createWorkspaceScratch(workspace)).toBe(OPENCODE_OAUTH_FAILURE_NOTICE);
    const result = sandboxSpawn({ workspaceDir: workspace, tokens: { opencode: 'test-key' } }, command, [], {
      XDG_DATA_HOME: 'ambient-data', ANTHROPIC_API_KEY: 'ambient-anthropic',
    });
    expect(result.command).toBe(command);
    expect(result.env.XDG_DATA_HOME).toBe('ambient-data');
    expect(result.env.OPENCODE_API_KEY).toBe('test-key');
    expect(result.env.ANTHROPIC_API_KEY).toBe('ambient-anthropic');
    expect(fs.existsSync(path.join(`${workspace}.tmp`, 'opencode-data'))).toBe(false);
  });

  it('treats absent source credentials as absent rather than a failure', () => {
    loadOpencodeOauth(path.join(root, 'absent'));
    expect(prepareOpencodeData(scratch)).toEqual({ type: 'absent' });
    expect(createWorkspaceScratch(path.join(root, 'absent-workspace'))).toBeUndefined();
  });
});
