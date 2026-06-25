import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Mint a per-session token handed to the browser via the launch URL. */
export function makeToken(): string {
  return randomBytes(24).toString('base64url');
}

// A request is only accepted when its Host (and Origin, when present) are loopback. This is the
// DNS-rebinding / stray-tab guard: even bound to 127.0.0.1, a remote page could otherwise try to
// reach the shell server with a spoofed Host header.
const LOOPBACK = /^(127\.0\.0\.1|\[::1\]|::1|localhost)(:\d+)?$/i;

export function originAllowed(request: IncomingMessage): boolean {
  const host = request.headers.host ?? '';
  if (!LOOPBACK.test(host)) return false;
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (!LOOPBACK.test(new URL(origin).host)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Extract the `token` query param from a request URL. */
export function tokenFromReq(request: IncomingMessage): string | null {
  try {
    return new URL(request.url ?? '', 'http://localhost').searchParams.get('token');
  } catch {
    return null;
  }
}

/** Constant-time token comparison. */
export function tokenMatches(expected: string, got: string | null): boolean {
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
