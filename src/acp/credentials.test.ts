import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { acpCredentials } from './credentials.js';
import { loadOpencodeOauth } from '../project/opencode-oauth.js';

let root: string;
const disposals: (() => void)[] = [];

beforeEach(() => {
  mkdirSync('temp', { recursive: true });
  root = mkdtempSync(path.join(process.cwd(), 'temp', 'acp-credentials-'));
  mkdirSync(path.join(root, '.codex'));
  writeFileSync(path.join(root, '.codex', 'auth.json'), JSON.stringify({ tokens: {
    access_token: `header.${Buffer.from('{"exp":1800000000}').toString('base64url')}.signature`,
    refresh_token: 'refresh', account_id: 'account',
  } }));
  loadOpencodeOauth(root);
});

afterEach(() => {
  for (const dispose of disposals) dispose();
  disposals.length = 0;
  loadOpencodeOauth(path.join(root, 'absent'));
  rmSync(root, { recursive: true, force: true });
});

describe('ACP private OAuth credentials', () => {
  it('seeds owner-only OpenCode credentials and removes them on disposal', () => {
    const credentials = acpCredentials();
    disposals.push(credentials.dispose);
    const dataHome = credentials.env.XDG_DATA_HOME!;
    const file = path.join(dataHome, 'opencode', 'auth.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ openai: { refresh: 'refresh', accountId: 'account' } });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(dataHome)).mode & 0o777).toBe(0o700);
    credentials.dispose();
    expect(existsSync(path.dirname(dataHome))).toBe(false);
    expect(() => credentials.dispose()).not.toThrow();
  });

  it('leaves workspace credential provisioning to its owner', () => {
    expect(acpCredentials(root).env).toEqual({});
  });

  it('preserves the ambient data location when there is no saved login', () => {
    loadOpencodeOauth(path.join(root, 'absent'));
    expect(acpCredentials().env).toEqual({});
  });
});
