import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bundleDirOf, packageDirOf, resolvePackageDir, chromiumBundleDir, playwrightPackagePaths,
  PLAYWRIGHT_PATH_PLACEHOLDER,
} from './playwright-paths.js';

// What `chromiumBundleDir` returns is the one path the browser's Seatbelt profile grants Chromium
// read access to, so a wrong answer either stops the browser starting or widens a carve-in past the
// bundle. The walk is tested against constructed layouts rather than against whatever Playwright has
// installed here: a suite that only asserted on the ambient answer would pass on this machine and
// prove nothing about the shapes it exists to handle.

const dirs: string[] = [];

function tempTree(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'playwright-paths-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe('bundleDirOf', () => {
  const BUNDLE = '/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app';

  it('resolves a macOS bundle layout to the .app, not to Contents or MacOS', () => {
    const executable = `${BUNDLE}/Contents/MacOS/Google Chrome for Testing`;
    expect(bundleDirOf(executable)).toBe(BUNDLE);
  });

  // Without the root check this walks to `/` and hands Seatbelt the whole filesystem.
  it('resolves a bare executable to its own directory rather than walking to the root', () => {
    expect(bundleDirOf('/opt/chromium/chrome')).toBe('/opt/chromium');
  });

  // Nearest, not outermost: the enclosing bundle would be the wider carve-in, and this answer goes
  // straight into the profile.
  it('resolves to the nearest .app when one bundle sits inside another', () => {
    const inner = '/Applications/Outer.app/Contents/Frameworks/Inner.app';
    expect(bundleDirOf(`${inner}/Contents/MacOS/inner`)).toBe(inner);
  });

  it('finds the bundle when the executable sits directly inside it', () => {
    expect(bundleDirOf(`${BUNDLE}/chrome`)).toBe(BUNDLE);
  });
});

describe('packageDirOf', () => {
  it('walks up to the directory holding package.json', () => {
    const root = tempTree();
    writeFileSync(path.join(root, 'package.json'), '{}');
    mkdirSync(path.join(root, 'lib', 'esm'), { recursive: true });
    expect(packageDirOf(path.join(root, 'lib', 'esm', 'index.js'))).toBe(root);
  });

  it('stops at the nearest manifest when two are stacked', () => {
    const root = tempTree();
    writeFileSync(path.join(root, 'package.json'), '{}');
    const nested = path.join(root, 'node_modules', 'inner');
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(nested, 'package.json'), '{}');
    expect(packageDirOf(path.join(nested, 'index.js'))).toBe(nested);
  });

  // The walk does not stop at the entry's own directory — it keeps going until it finds a manifest,
  // so an entry in a bare subdirectory resolves to the enclosing package rather than to itself.
  it('walks past directories with no manifest to the nearest ancestor that has one', () => {
    const root = tempTree();
    writeFileSync(path.join(root, 'package.json'), '{}');
    const leaf = path.join(root, 'a', 'b', 'c');
    mkdirSync(leaf, { recursive: true });
    expect(packageDirOf(path.join(leaf, 'index.js'))).toBe(root);
  });

  // The fallback that keeps this from returning `/` for an entry outside any package. It needs a
  // path with no manifest anywhere above it, which a temp directory cannot supply here: this repo
  // redirects TMPDIR inside its own checkout, so the walk would find the project's own manifest.
  it('falls back to the entry\'s own directory when no manifest is found', () => {
    const leaf = '/janissary-no-manifest-above-here/pkg';
    expect(packageDirOf(path.join(leaf, 'index.js'))).toBe(leaf);
  });
});

describe('resolvePackageDir and the placeholder', () => {
  // The branch that produces the placeholder rather than throwing, so a `-D` parameter is always
  // bound to something.
  it('returns undefined for a specifier that cannot resolve', () => {
    expect(resolvePackageDir('@janissary/definitely-not-installed')).toBeUndefined();
  });

  it('resolves an installed package to a real directory', () => {
    const dir = resolvePackageDir('playwright');
    expect(dir).toBeTruthy();
    expect(existsSync(dir ?? '')).toBe(true);
  });
});

describe('playwrightPackagePaths', () => {
  it('binds every directory to a real path or to the placeholder, never to nothing', () => {
    const { entry, dirs: packageDirs } = playwrightPackagePaths();
    expect(packageDirs).toHaveLength(2);
    for (const dir of [...packageDirs, entry]) {
      expect(dir).toBeTruthy();
      expect(dir === PLAYWRIGHT_PATH_PLACEHOLDER || existsSync(dir)).toBe(true);
    }
  });

  // Resolved separately rather than assumed nested: in a hoisted layout playwright-core is a sibling.
  it('resolves playwright-core separately from playwright', () => {
    const { dirs: packageDirs } = playwrightPackagePaths();
    expect(packageDirs[0]).not.toBe(packageDirs[1]);
  });

  // The memoization, provable here because the cache holds an object: a second call that re-resolved
  // would build a new one.
  it('returns the identical object on a second call', () => {
    expect(playwrightPackagePaths()).toBe(playwrightPackagePaths());
  });
});

describe('chromiumBundleDir', () => {
  it('resolves to a platform carve-in or the placeholder, never to an inner bundle directory', () => {
    const dir = chromiumBundleDir();
    expect(dir === PLAYWRIGHT_PATH_PLACEHOLDER || path.isAbsolute(dir)).toBe(true);
    if (process.platform === 'darwin' && dir !== PLAYWRIGHT_PATH_PLACEHOLDER) {
      expect(path.extname(dir)).toBe('.app');
    }
    expect(['Contents', 'MacOS']).not.toContain(path.basename(dir));
  });

  // Stability rather than a caching assertion: the cache holds a string, so equal values would not
  // prove the second call skipped the work.
  it('gives the same answer every time', () => {
    expect(chromiumBundleDir()).toBe(chromiumBundleDir());
  });
});
