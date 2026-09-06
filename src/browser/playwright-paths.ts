import { createRequire } from 'node:module';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Where the `playwright` package the janissary server is itself running actually lives, and where
// the Chromium it would launch actually lives. Two consumers need these and neither may import the
// other: the harness Seatbelt profile carves the package directories in for reads (so a sandboxed
// script can import the client janissary hands it), and the e2e browser server names the entry path
// in `JANISSARY_PLAYWRIGHT` and the Chromium bundle in the browser profile.
//
// Both answers are memoized on first use, since neither can change while the process runs. Packages
// are located through `node:module`'s `createRequire` rather than by walking `node_modules` by hand,
// so a hoisted, nested, or linked layout all resolve the same way.
//
// The two ancestor walks — `bundleDirOf` and `packageDirOf` — are kept separate from the resolution
// that feeds them, and exported. They are where the decisions are, and separating them is what lets
// them be tested against constructed layouts instead of against whatever this machine happens to
// have installed, which is the test that passes for the wrong reason.

const require_ = createRequire(import.meta.url);

// A path that matches nothing, so a Seatbelt `-D` param always has a bound value even when
// resolution fails outright. Same fallback shape `resolveExecutableDirs` uses in `sandbox/index.ts`.
export const PLAYWRIGHT_PATH_PLACEHOLDER = '/nonexistent-janissary-playwright-placeholder';

export type PlaywrightPackagePaths = {
  // The resolved entry path of the `playwright` package — what `JANISSARY_PLAYWRIGHT` carries, so a
  // sandboxed agent imports the same build the browser server is running. Playwright's client and
  // server must be the same version to connect at all, and a fresh workspace clone has no
  // `node_modules` until the AI installs them, so this cannot be left to the project.
  entry: string;
  // The `playwright` and `playwright-core` package directories. `playwright-core` is resolved
  // separately rather than assumed to be nested: it is `playwright`'s only runtime dependency, and
  // in a hoisted layout it sits as a sibling, so carving in `playwright` alone would leave every
  // internal require denied.
  dirs: string[];
};

// Walk up from a resolved entry file to the directory holding its `package.json` — the package root,
// whatever the layout. Falls back to the file's own directory if no manifest is found.
export function packageDirOf(entry: string): string {
  let dir = path.dirname(entry);
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.dirname(entry);
    dir = parent;
  }
}

// `undefined` rather than a throw for a specifier that will not resolve, so the caller can substitute
// the placeholder — the branch that keeps a Seatbelt `-D` parameter bound to something.
export function resolvePackageDir(specifier: string): string | undefined {
  try {
    return packageDirOf(require_.resolve(specifier));
  } catch {
    return undefined;
  }
}

let cachedPackagePaths: PlaywrightPackagePaths | undefined;

export function playwrightPackagePaths(): PlaywrightPackagePaths {
  if (cachedPackagePaths) return cachedPackagePaths;
  let entry = PLAYWRIGHT_PATH_PLACEHOLDER;
  try { entry = require_.resolve('playwright'); } catch { /* not installed */ }
  const dirs = ['playwright', 'playwright-core']
    .map((name) => resolvePackageDir(name) ?? PLAYWRIGHT_PATH_PLACEHOLDER);
  cachedPackagePaths = { entry, dirs };
  return cachedPackagePaths;
}

let cachedChromiumDir: string | undefined;

/**
 * The directory the browser profile carves in so Chromium can read its own executable, frameworks,
 * and resources: the nearest `.app` bundle ancestor of Playwright's Chromium binary, or that
 * binary's own directory when it is not bundled. On macOS this resolves under
 * `~/Library/Caches/ms-playwright/`, which is inside the `$HOME` content deny and carved in nowhere
 * else — which is exactly why a sandboxed agent cannot launch its own browser and needs this one.
 *
 * Requires `playwright` for real (the package's own logic knows which revision is installed), unlike
 * `playwrightPackagePaths` above, which only resolves specifiers. Kept separate so the harness
 * carve-in — which runs on every sandboxed spawn — never pays for loading it.
 */
export function chromiumBundleDir(): string {
  if (cachedChromiumDir) return cachedChromiumDir;
  cachedChromiumDir = findChromiumBundleDir();
  return cachedChromiumDir;
}

// The nearest `.app` ancestor of an already-resolved executable path, or that executable's own
// directory when no ancestor is a bundle. Nearest rather than outermost on purpose: a bundle nested
// inside another is the narrower carve-in, and this answer is handed straight to Seatbelt.
//
// Pure, and takes the resolved path rather than resolving one, so the layouts that matter — a macOS
// bundle, a bare binary, one bundle inside another — can be checked without any of them existing.
export function bundleDirOf(resolvedExecutable: string): string {
  let dir = path.dirname(resolvedExecutable);
  for (;;) {
    if (path.extname(dir) === '.app') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.dirname(resolvedExecutable);
    dir = parent;
  }
}

function findChromiumBundleDir(): string {
  let executable: string;
  try {
    const playwright = require_('playwright') as { chromium: { executablePath: () => string } };
    executable = playwright.chromium.executablePath();
  } catch {
    return PLAYWRIGHT_PATH_PLACEHOLDER;
  }
  if (!executable) return PLAYWRIGHT_PATH_PLACEHOLDER;
  return bundleDirOf(existsSync(executable) ? realpathSync(executable) : executable);
}
