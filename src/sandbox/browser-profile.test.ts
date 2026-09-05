import { describe, it, expect } from 'vitest';
import { BROWSER_SANDBOX_PROFILE, browserProfileParams } from './browser-profile.js';
import { SANDBOX_PROFILE } from './profile.js';

// The browser profile exists to be *narrower* than the harness one. These pin that: the carve-ins
// it needs are present, and the harness profile's credential-adjacent carve-ins are not — which is
// what keeps decision 9 from quietly regressing into "just reuse the harness profile".

// A checkout-shaped installation: janissary is running from its own clone, so the installation
// root, the project directory, and the parent of every workspace are one path. That is the case the
// old recursive carve-in of the root got wrong, so it is the case the fixture describes.
const ROOT = '/Users/dev/janissary';
const STATE = `${ROOT}/.janissary`;
const dual = (p: string) => ({ literal: p, real: p });

const PATHS = {
  workspace: `${STATE}/workspace/browsers/claude-tok`,
  tmp: `${STATE}/workspace/browsers/claude-tok.tmp`,
  home: '/Users/dev',
  cache: '/var/folders/xx/hash/C',
  chromium: { literal: '/Users/dev/Library/Caches/ms-playwright/chromium-1/Chrome.app', real: '/private/Users/dev/pw/Chrome.app' },
  node: { literal: '/opt/node/bin', real: '/opt/node-26/bin' },
  appModules: dual(`${ROOT}/node_modules`),
  // Deliberately kept alongside the deny below: with both, restoring the old recursive root
  // carve-in still leaves the project state denied. The two are independent on purpose.
  appEntry: dual(`${ROOT}/src`),
  playwright: dual(`${ROOT}/node_modules/playwright`),
  playwrightCore: dual(`${ROOT}/node_modules/playwright-core`),
  appManifest: dual(`${ROOT}/package.json`),
  appTsconfig: dual(`${ROOT}/tsconfig.json`),
  appState: dual(STATE),
};

// A miniature Seatbelt evaluator for file *content* reads: walk the rules in order and keep the last
// one that matches, which is the semantic Seatbelt itself uses. Enough to answer "would this path be
// readable", which is the question the finding asks and which a `toContain` on the template cannot.
type Rule = { allow: boolean; clauses: { kind: string; path: string }[]; unrestricted: boolean };

// The operation names on a rule's opening line — everything after the verb and before its first
// clause, so a path that happens to contain the text `file-read` cannot be mistaken for one.
function operationsOf(line: string): string {
  const body = line.slice(line.indexOf(' ') + 1);
  const clause = body.search(/\(/);
  return clause === -1 ? body : body.slice(0, clause);
}

function readRules(text: string): Rule[] {
  const rules: Rule[] = [];
  let current: Rule | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith('(allow ') || line.startsWith('(deny ')) {
      const reads = /file-read\*|file-read-data/.test(operationsOf(line));
      current = reads
        ? { allow: line.startsWith('(allow '), clauses: [], unrestricted: !/\((param|subpath|literal)/.test(line) }
        : undefined;
      if (current) rules.push(current);
    } else if (!line.startsWith(' ') && line.trim() !== '') {
      current = undefined;
    }
    if (!current) continue;
    for (const match of line.matchAll(/\((subpath|literal) "([^"]+)"\)/g)) {
      current.clauses.push({ kind: match[1], path: match[2] });
    }
  }
  return rules;
}

function matches(rule: Rule, target: string): boolean {
  if (rule.unrestricted && rule.clauses.length === 0) return true;
  return rule.clauses.some(({ kind, path: p }) => (
    kind === 'literal' ? target === p : target === p || target.startsWith(`${p}/`)
  ));
}

function readable(target: string): boolean {
  let allowed = false;
  for (const rule of readRules(resolvedProfile())) {
    if (matches(rule, target)) allowed = rule.allow;
  }
  return allowed;
}

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
    const carveIndex = RULES.indexOf('(allow file-read-data file-read-xattr\n  (subpath (param "B');
    expect(denyIndex).toBeGreaterThan(-1);
    expect(carveIndex).toBeGreaterThan(denyIndex);
  });

  it('carves in the Chromium bundle, the browser workspace, and its temp sibling', () => {
    expect(readable(`${PATHS.chromium.literal}/Contents/MacOS/Chromium`)).toBe(true);
    expect(readable(`${PATHS.chromium.real}/Contents/MacOS/Chromium`)).toBe(true);
    expect(readable(`${PATHS.workspace}/Default/Preferences`)).toBe(true);
    expect(readable(`${PATHS.tmp}/profile/Cookies`)).toBe(true);
  });

  it('carves in the runtime pieces the child needs to start', () => {
    expect(readable(`${PATHS.node.literal}/node`)).toBe(true);
    expect(readable(`${PATHS.appModules.literal}/ws/index.js`)).toBe(true);
    expect(readable(`${PATHS.appEntry.literal}/main.ts`)).toBe(true);
    expect(readable(`${PATHS.playwright.literal}/index.js`)).toBe(true);
    expect(readable(`${PATHS.playwrightCore.literal}/lib/server.js`)).toBe(true);
  });

  // Files, not directories: carved in by exact path so the root holding them stays narrowed away.
  it('carves in the manifest and tsconfig as exact paths, not as a directory', () => {
    expect(readable(PATHS.appManifest.literal)).toBe(true);
    expect(readable(PATHS.appTsconfig.literal)).toBe(true);
    expect(readable(`${ROOT}/README.md`)).toBe(false);
  });

  // The regression that would silently restore everything below it.
  it('does not carve in the installation root itself', () => {
    expect(readable(`${ROOT}/anything-else`)).toBe(false);
    expect(resolvedProfile()).not.toContain(`(subpath "${ROOT}")`);
  });

  // What the old recursive root carve-in exposed, named one file at a time.
  it.each([
    ['the project token store', `${STATE}/project-tokens.json`],
    ['the server log holding the live session token', `${STATE}/log/server.log`],
    ['another tab\'s workspace clone', `${STATE}/workspace/other-tab/src/secret.ts`],
    ['the state directory itself', `${STATE}/anything`],
  ])('denies %s', (_name, target) => {
    expect(readable(target)).toBe(false);
  });

  // The browser's own scratch lives *inside* the directory just denied, so it has to be allowed
  // after it. Ordering, not coincidence: this is the pair that pins it.
  it('keeps the browser\'s own scratch readable inside the denied state directory', () => {
    expect(PATHS.workspace.startsWith(`${STATE}/`)).toBe(true);
    expect(readable(`${PATHS.workspace}/Default/Preferences`)).toBe(true);
  });

  it('orders the runtime carve-ins, then the state deny, then the browser\'s own scratch', () => {
    const carve = RULES.indexOf('(allow file-read-data file-read-xattr\n  (subpath (param "B');
    const deny = RULES.indexOf('(deny file-read-data file-read-xattr\n  (subpath (param "X');
    const scratch = RULES.indexOf('(allow file-read-data file-read-xattr\n  (subpath (param "WORKSPACE"))');
    expect(carve).toBeGreaterThan(-1);
    expect(deny).toBeGreaterThan(carve);
    expect(scratch).toBeGreaterThan(deny);
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
    for (const entry of [PATHS.chromium, PATHS.node, PATHS.appModules, PATHS.appEntry]) {
      expect(values).toContain(entry.literal);
      expect(values).toContain(entry.real);
    }
  });
});
