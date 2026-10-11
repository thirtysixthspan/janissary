import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getOpencodeOauth, loadOpencodeOauth, parseCodexOauth } from './opencode-oauth.js';
import { loadProjectTokens } from './tokens.js';

let home: string;
const tokens = {
  access_token: `header.${Buffer.from(JSON.stringify({ exp: 1_800_000_000 })).toString('base64url')}.signature`,
  refresh_token: 'test-refresh',
  account_id: 'test-account',
};

beforeEach(() => {
  mkdirSync('temp', { recursive: true });
  home = mkdtempSync(path.join(process.cwd(), 'temp', 'codex-oauth-'));
  mkdirSync(path.join(home, '.codex'));
});

afterEach(() => {
  loadOpencodeOauth(path.join(home, 'absent'));
  rmSync(home, { recursive: true, force: true });
});

describe('parseCodexOauth', () => {
  it('converts ChatGPT tokens to the OpenCode OAuth entry with expiry in milliseconds', () => {
    expect(parseCodexOauth(JSON.stringify({ tokens }))).toEqual({
      type: 'oauth', access: tokens.access_token, refresh: tokens.refresh_token,
      accountId: tokens.account_id, expires: 1_800_000_000_000,
    });
  });

  it('accepts expired access tokens so OpenCode can refresh them', () => {
    const access_token = `header.${Buffer.from('{"exp":1}').toString('base64url')}.signature`;
    expect(parseCodexOauth(JSON.stringify({ tokens: { ...tokens, access_token } }))?.expires).toBe(1000);
  });

  it.each(['access_token', 'refresh_token', 'account_id'])('requires a nonempty string %s', (field) => {
    for (const value of [undefined, null, '', '  ', 123, [], {}]) {
      expect(parseCodexOauth(JSON.stringify({ tokens: { ...tokens, [field]: value } }))).toBeUndefined();
    }
  });

  it.each(['broken json', 'null', '[]', '{}', '{"tokens":[]}', '{"tokens":null}'])('ignores invalid source %s', (raw) => {
    expect(parseCodexOauth(raw)).toBeUndefined();
  });

  it.each(['not-a-jwt', 'header..signature', 'header.invalid.signature', 'header.e30.signature.extra'])('ignores malformed JWT %s', (access_token) => {
    expect(parseCodexOauth(JSON.stringify({ tokens: { ...tokens, access_token } }))).toBeUndefined();
  });

  it.each([undefined, null, '1800000000', 0, -1, 1e100])('ignores invalid expiry %s', (exp) => {
    const access_token = `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
    expect(parseCodexOauth(JSON.stringify({ tokens: { ...tokens, access_token } }))).toBeUndefined();
  });
});

describe('startup credential loading', () => {
  it('loads the host login through the existing startup loader without adding it to forwarded tokens', () => {
    writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({ tokens }));
    expect(loadProjectTokens(home, home)).toEqual({});
    expect(getOpencodeOauth()?.accountId).toBe('test-account');
  });

  it('clears the previous credential when the next home has no login', () => {
    writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({ tokens }));
    loadOpencodeOauth(home);
    expect(getOpencodeOauth()).toBeDefined();
    loadOpencodeOauth(path.join(home, 'absent'));
    expect(getOpencodeOauth()).toBeUndefined();
  });

  it('ignores unreadable credentials and clears the previous login', () => {
    const file = path.join(home, '.codex', 'auth.json');
    writeFileSync(file, JSON.stringify({ tokens }));
    loadOpencodeOauth(home);
    rmSync(file);
    mkdirSync(file);
    expect(() => loadOpencodeOauth(home)).not.toThrow();
    expect(getOpencodeOauth()).toBeUndefined();
  });

  it('ignores corrupt credentials without reporting their contents', () => {
    writeFileSync(path.join(home, '.codex', 'auth.json'), 'private corrupt contents');
    expect(() => loadOpencodeOauth(home)).not.toThrow();
    expect(getOpencodeOauth()).toBeUndefined();
  });
});
