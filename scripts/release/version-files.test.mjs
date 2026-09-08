import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VERSION_FILES, bumpVersion, writeVersionFiles } from './version-files.mjs';

const MANIFEST = {
  name: 'janissary',
  version: '0.12.0',
  license: 'PolyForm-Noncommercial-1.0.0',
  dependencies: { diff: '^9.0.0' },
};

// A lockfileVersion 3 file in miniature: the version at the root, again in the entry for the root
// package itself, and a third one belonging to a dependency that must not move.
const LOCKFILE = {
  name: 'janissary',
  version: '0.12.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'janissary', version: '0.12.0', dependencies: { diff: '^9.0.0' } },
    'node_modules/diff': { version: '9.0.0', resolved: 'https://registry.npmjs.org/diff/-/diff-9.0.0.tgz' },
  },
};

const serialize = (document) => JSON.stringify(document, null, 2) + '\n';

describe('bumpVersion', () => {
  it('sets a manifest\'s version and leaves its other fields alone', () => {
    const bumped = JSON.parse(bumpVersion(serialize(MANIFEST), '0.13.0'));
    expect(bumped.version).toBe('0.13.0');
    expect(bumped).toMatchObject({
      name: 'janissary',
      license: 'PolyForm-Noncommercial-1.0.0',
      dependencies: { diff: '^9.0.0' },
    });
  });

  it('sets both the version a lockfile carries at its root and the one in its root package entry', () => {
    const bumped = JSON.parse(bumpVersion(serialize(LOCKFILE), '0.13.0'));
    expect(bumped.version).toBe('0.13.0');
    expect(bumped.packages[''].version).toBe('0.13.0');
  });

  it('leaves a dependency\'s own version where it is', () => {
    const bumped = JSON.parse(bumpVersion(serialize(LOCKFILE), '0.13.0'));
    expect(bumped.packages['node_modules/diff'].version).toBe('9.0.0');
    expect(bumped.lockfileVersion).toBe(3);
  });

  it('sets only the root version of a lockfile that has no root package entry', () => {
    const trimmed = { name: 'janissary', version: '0.12.0', lockfileVersion: 3, packages: {} };
    const bumped = JSON.parse(bumpVersion(serialize(trimmed), '0.13.0'));
    expect(bumped.version).toBe('0.13.0');
    expect(bumped.packages).toEqual({});
  });

  it('writes two-space indentation and a trailing newline, so the file it leaves is the file npm would', () => {
    const text = bumpVersion(serialize(LOCKFILE), '0.13.0');
    expect(text).toBe(serialize({ ...LOCKFILE, version: '0.13.0', packages: { ...LOCKFILE.packages, '': { ...LOCKFILE.packages[''], version: '0.13.0' } } }));
    expect(text.endsWith('}\n')).toBe(true);
  });
});

describe('writeVersionFiles', () => {
  let root;

  const write = (name, document) => writeFileSync(path.join(root, name), serialize(document));
  const read = (name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'janus-release-'));
    write('package.json', MANIFEST);
    write('package-lock.json', LOCKFILE);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes the new version into the manifest and the lockfile alike', () => {
    writeVersionFiles(root, '0.13.0');
    expect(read('package.json').version).toBe('0.13.0');
    expect(read('package-lock.json').version).toBe('0.13.0');
    expect(read('package-lock.json').packages[''].version).toBe('0.13.0');
  });

  it('returns every path it wrote, in the order the release commit stages them', () => {
    expect(writeVersionFiles(root, '0.13.0')).toEqual(VERSION_FILES.map((name) => path.join(root, name)));
  });

  it('fails naming the file it could not find', () => {
    rmSync(path.join(root, 'package-lock.json'));
    expect(() => writeVersionFiles(root, '0.13.0')).toThrow('missing package-lock.json');
  });

  it('writes nothing at all when one file is missing, so a release never half-bumps', () => {
    rmSync(path.join(root, 'package-lock.json'));
    expect(() => writeVersionFiles(root, '0.13.0')).toThrow();
    expect(read('package.json').version).toBe('0.12.0');
  });
});
