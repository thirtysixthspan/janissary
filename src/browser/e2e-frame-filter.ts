// The matching rules the e2e browser guard applies to one Playwright-protocol frame, kept pure and
// separate from the socket plumbing in `e2e-guard.ts` so each rule can be tested on a string without
// standing up two websockets. Every function here answers one question — should this frame end the
// session — and does no I/O.
//
// Matching is done on *parsed* values, never a substring scan of the raw frame: a scan misses a
// `file:` URL written with JSON Unicode escapes (`file:`), which `JSON.parse` resolves and a
// `String.includes` does not. That is the whole reason the guard parses rather than greps.

export type FrameVerdict = { blocked: false } | { blocked: true; reason: string };

const ALLOWED: FrameVerdict = { blocked: false };

// The fields a browser-to-client frame reports a navigation *result* in — the page's own address,
// the document's address, and the same `url` key on every node of the frame tree. Only these are
// inspected on the way back, so a page whose visible text merely contains the characters `file://`
// does not tear down the session (a client-to-browser frame gets the strict every-string treatment
// instead, since there the client is asking rather than the page reporting).
const NAVIGATION_URL_KEYS = new Set(['url', 'documentURL']);

// The URL parser does two things before it reads a scheme, in this order: it removes every ASCII
// tab and newline from the *whole* input, and then it trims leading C0 controls and spaces. Both
// have to happen here or the guard and the browser disagree about what a string names.
//
// The second alone is not enough, which is the trap: `fi<TAB>le:///etc/passwd` has no leading
// padding at all, so trimming leaves the scheme as `fi<TAB>le` — not `file`, relayed — while
// Chromium drops the tab and navigates to the file URL. Same for a CR or an LF, at any position.
const TAB_OR_NEWLINE = /[\t\n\r]/g;

function schemeOf(value: string): string {
  const parsed = value.replaceAll(TAB_OR_NEWLINE, '');
  let start = 0;
  while (start < parsed.length && (parsed.codePointAt(start) ?? 0) <= 0x20) start += 1;
  const colon = parsed.indexOf(':', start);
  return colon === -1 ? '' : parsed.slice(start, colon).toLowerCase();
}

export function isFileUrl(value: string): boolean {
  return schemeOf(value) === 'file';
}

// Walk every string in a parsed frame, handing the visitor the key the string was found under
// (undefined at the root). Array elements inherit their array's key, so `{ "urls": ["file:///x"] }`
// is still seen as a `url`-ish position — the fail-closed reading. Iterative rather than recursive
// so a deeply nested frame cannot overflow the stack before it can be judged.
type Keyed = { key: string | undefined; value: unknown };

function childrenOf({ key, value }: Keyed): Keyed[] {
  // `Array.isArray` narrows `unknown` to `any[]` and `Object.entries` on a bare `object` yields
  // `any` values, so both are re-typed as `unknown` here rather than carried onward as `any`.
  if (Array.isArray(value)) return (value as unknown[]).map((item) => ({ key, value: item }));
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value) as [string, unknown][];
    return entries.map(([childKey, child]) => ({ key: childKey, value: child }));
  }
  return [];
}

function anyString(root: unknown, matches: (key: string | undefined, value: string) => boolean): boolean {
  const stack: Keyed[] = [{ key: undefined, value: root }];
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    if (typeof entry.value === 'string') {
      if (matches(entry.key, entry.value)) return true;
      continue;
    }
    for (const child of childrenOf(entry)) stack.push(child);
  }
  return false;
}

// A frame that will not decode as UTF-8 JSON ends the session rather than being waved through.
// browserless exempts binary frames from inspection so a benign blob does not tear down a session;
// this does not, because a client free to choose its frame encoding could otherwise choose the one
// that is not read. `null`, `true`, and a bare number all parse, and all are equally not a protocol
// message, so a frame must parse *to an object or array* to count as readable.
function parseFrame(text: string): unknown | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
}

const UNREADABLE: FrameVerdict = { blocked: true, reason: 'unreadable protocol frame' };

// Client → browser. Any string anywhere in the message that names a `file:` URL blocks it: on this
// side the client is asking the browser to do something, and there is no field where a `file:` URL
// is a legitimate request from a sandboxed agent.
export function inspectClientFrame(text: string): FrameVerdict {
  const frame = parseFrame(text);
  if (frame === undefined) return UNREADABLE;
  return anyString(frame, (_key, value) => isFileUrl(value))
    ? { blocked: true, reason: 'file: URL blocked' }
    : ALLOWED;
}

// Browser → client. Only the navigation-result fields are checked, so ordinary page content that
// happens to mention `file://` relays through untouched while a navigation that actually landed on
// one does not.
export function inspectServerFrame(text: string): FrameVerdict {
  const frame = parseFrame(text);
  if (frame === undefined) return UNREADABLE;
  return anyString(frame, (key, value) => key !== undefined && NAVIGATION_URL_KEYS.has(key) && isFileUrl(value))
    ? { blocked: true, reason: 'file: URL blocked' }
    : ALLOWED;
}
