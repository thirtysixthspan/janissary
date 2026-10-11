import { readFileSync } from 'node:fs';
import path from 'node:path';

export type OpencodeOauth = {
  type: 'oauth';
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
};

let oauth: OpencodeOauth | undefined;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseCodexOauth(raw: string): OpencodeOauth | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    const tokens = record(record(parsed)?.tokens);
    if (!tokens) return undefined;
    const { access_token: access, refresh_token: refresh, account_id: accountId } = tokens;
    if (!nonemptyString(access) || !nonemptyString(refresh) || !nonemptyString(accountId)) return undefined;
    const parts = access.split('.');
    if (parts.length !== 3 || !parts[1]) return undefined;
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const expiry = record(payload)?.exp;
    if (typeof expiry !== 'number' || !Number.isFinite(expiry) || expiry <= 0) return undefined;
    const expires = expiry * 1000;
    if (!Number.isSafeInteger(expires)) return undefined;
    return { type: 'oauth', access, refresh, expires, accountId };
  } catch {
    return undefined;
  }
}

export function loadOpencodeOauth(home: string): void {
  oauth = undefined;
  try {
    oauth = parseCodexOauth(readFileSync(path.join(home, '.codex', 'auth.json'), 'utf8'));
  } catch {
    return;
  }
}

export function getOpencodeOauth(): OpencodeOauth | undefined {
  return oauth;
}
