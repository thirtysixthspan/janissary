import { describe, it, expect } from 'vitest';
import { BROWSER_SANDBOX_PROFILE, browserProfileParams } from './browser-profile.js';
import { SANDBOX_PROFILE } from './profile.js';

// The browser profile exists to be *narrower* than the harness one. These pin that: the carve-ins
// it needs are present, and the harness profile's credential-adjacent carve-ins are not — which is
// what keeps decision 9 from quietly regressing into "just reuse the harness profile".

const PATHS = {
  workspace: '/ws/claude.browser',
  tmp: '/ws/claude.browser.tmp',
  home: '/Users/dev',
  cache: '/var/folders/xx/hash/C',
  chromium: { literal: '/Users/dev/Library/Caches/ms-playwright/chromium-1/Chrome.app', real: '/private/Users/dev/pw/Chrome.app' },
  node: { literal: '/opt/node/bin', real: '/opt/node-26/bin' },
  app: { literal: '/Users/dev/janissary', real: '/private/Users/dev/janissary' },
};

// The profile's rules with every `;` comment line dropped. Seatbelt comments carry the reasoning,
// including the names of the very paths this profile refuses to carve in, so an assertion about
// what the profile *grants* has to read the rules alone.
function rulesOnly(text: string): string {
  return text.split('\n').filter((line) => !line.trimStart().startsWith(';')).join('\n');
}

// Every `-D` binding as a `[name, value]` pair — the value may itself contain `=`, so the split is
// on the first one only.
function bindings(): [string, string][] {
  const params = browserProfileParams(PATHS);
  return params
    .filter((_, i) => i % 2 === 1)
    .map((param) => [param.slice(0, param.indexOf('=')), param.slice(param.indexOf('=') + 1)]);
}

// Bind every `-D` param into the profile text, so an assertion reads the paths the way sandbox-exec
// would rather than the unsubstituted `(param "…")` placeholders.
function resolvedProfile(): string {
  let text = rulesOnly(BROWSER_SANDBOX_PROFILE);
  for (const [name, value] of bindings()) {
    text = text.split(`(param "${name}")`).join(`"${value}"`);
  }
  return text;
}

const RULES = rulesOnly(BROWSER_SANDBOX_PROFILE);

describe('BROWSER_SANDBOX_PROFILE', () => {
  it('denies everything by default', () => {
    expect(RULES).toContain('(deny default)');
  });

  it('denies the contents of $HOME before carving anything back in', () => {
    const denyIndex = RULES.indexOf('(deny file-read-data file-read-xattr (subpath (param "HOME")))');
    const carveIndex = RULES.indexOf('(allow file-read-data file-read-xattr\n  (subpath (param "WORKSPACE"))');
    expect(denyIndex).toBeGreaterThan(-1);
    expect(carveIndex).toBeGreaterThan(denyIndex);
  });

  it('carves in the Chromium bundle, the browser workspace, and its temp sibling', () => {
    const text = resolvedProfile();
    expect(text).toContain(`(subpath "${PATHS.chromium.literal}")`);
    expect(text).toContain(`(subpath "${PATHS.chromium.real}")`);
    expect(text).toContain(`(subpath "${PATHS.workspace}")`);
    expect(text).toContain(`(subpath "${PATHS.tmp}")`);
  });

  it('carves in the node directory and janissary root the child needs to start', () => {
    const text = resolvedProfile();
    expect(text).toContain(`(subpath "${PATHS.node.literal}")`);
    expect(text).toContain(`(subpath "${PATHS.node.real}")`);
    expect(text).toContain(`(subpath "${PATHS.app.literal}")`);
    expect(text).toContain(`(subpath "${PATHS.app.real}")`);
  });

  it('allows only the browser workspace, its temp sibling, and the system cache for writes', () => {
    // The `file-write*` rule's own indented clause lines — the rule ends at the next line that
    // starts a new one in column zero — so a path carved in for *reads* further down cannot satisfy
    // a write assertion.
    const lines = RULES.split('\n');
    const start = lines.findIndex((line) => line.startsWith('(allow file-write*'));
    const following = lines.slice(start + 1);
    const clauses: string[] = [];
    for (const line of following) {
      if (!line.startsWith('  ')) break;
      clauses.push(line.trim());
    }
    expect(clauses).toEqual([
      '(subpath (param "WORKSPACE"))',
      '(subpath (param "TMPDIR"))',
      '(subpath (param "DARWIN_USER_CACHE_DIR")))',
    ]);
  });

  // The operations the plan named as near-certain (POSIX shared memory) and likely (IOKit) for a
  // Chromium that has to come up inside an outer profile.
  it('allows the operations Chromium needs before it will start', () => {
    for (const operation of ['(allow ipc-posix-shm)', '(allow iokit-open)', '(allow sysctl-read)', '(allow mach-lookup)']) {
      expect(RULES).toContain(operation);
    }
  });

  it('allows the network, since what the browser may navigate to is the guard\'s job', () => {
    expect(RULES).toContain('(allow network*)');
  });

  // The assertion that actually matters. Every one of these IS carved into the harness profile, and
  // together they are close to an inventory of what an escape would want. Asserted against the
  // rules alone: the comments above them name these paths precisely because the profile refuses
  // them, so matching the comment text would pass for the wrong reason.
  it.each([
    ['Library/Keychains', 'Keychains'],
    ['.claude', 'claude'],
    ['.codex', 'codex'],
    ['opencode state', 'opencode'],
    ['ssh keys', 'ssh'],
    ['the harness self-binary carve-in', 'SELF_DIR'],
    ['the parent repo git objects', 'GIT_OBJECTS'],
  ])('carves in nothing for %s', (_name, needle) => {
    expect(RULES).not.toContain(needle);
  });

  it('is materially shorter than the harness profile it deliberately does not reuse', () => {
    expect(BROWSER_SANDBOX_PROFILE.length).toBeLessThan(SANDBOX_PROFILE.length);
  });
});

describe('browserProfileParams', () => {
  it('binds every parameter the profile names', () => {
    const bound = bindings().map(([name]) => name);
    const named = [...RULES.matchAll(/\(param "([^"]+)"\)/g)].map((match) => match[1]);
    for (const name of named) expect(bound).toContain(name);
  });

  it('binds each read carve-in in both its literal and realpath-resolved form', () => {
    const values = bindings().map(([, value]) => value);
    for (const dual of [PATHS.chromium, PATHS.node, PATHS.app]) {
      expect(values).toContain(dual.literal);
      expect(values).toContain(dual.real);
    }
  });
});
