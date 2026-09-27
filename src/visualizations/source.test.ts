import { rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSource } from './fetch.js';
import { addressIn, defaultSourceRoots, parseSource } from './source.js';

// The roots these tests are given are the process's own working directory and home, so a path built
// from either is inside one of them and a path into a system directory is inside neither.
const ROOTS = defaultSourceRoots(process.cwd());

describe('parseSource', () => {
  it('reads an http or https address as a url and normalizes it', () => {
    expect(parseSource('https://example.com/data.json', ROOTS)).toEqual({
      kind: 'url', url: 'https://example.com/data.json',
    });
    expect(parseSource('  https://example.com/a.csv  ', ROOTS)).toEqual({
      kind: 'url', url: 'https://example.com/a.csv',
    });
  });

  it('defaults a bare host to https, the way every other web target does', () => {
    expect(parseSource('example.com/data.csv', ROOTS)).toEqual({
      kind: 'url', url: 'https://example.com/data.csv',
    });
  });

  it('refuses an empty line', () => {
    expect(parseSource(' '.repeat(3), ROOTS)).toEqual({ error: 'empty source' });
  });

  // The scheme rules are `normalizeWebUrl`'s, deliberately: a source that `open` would refuse to
  // fetch is refused here for the same reason rather than by a second opinion that could drift.
  it('refuses a scheme that is not http or https, with the reason the web normalizer gives', () => {
    expect(parseSource('javascript:alert(1)', ROOTS)).toEqual({ error: 'unsupported scheme in "javascript:alert(1)"' });
    expect(parseSource('file:///etc/passwd', ROOTS)).toEqual({ error: 'unsupported scheme in "file:///etc/passwd"' });
    expect(parseSource('ftp://example.com/a.csv', ROOTS)).toEqual({ error: 'unsupported scheme in "ftp://example.com/a.csv"' });
  });
});

describe('a local source is bounded to the project directory and the home directory', () => {
  it('accepts a relative path inside the project, resolved against it', () => {
    expect(parseSource('./rows.csv', ROOTS)).toEqual({
      kind: 'file', path: path.join(ROOTS.project, 'rows.csv'),
    });
  });

  it('accepts a path inside the home', () => {
    expect(parseSource(path.join(ROOTS.home, 'rows.csv'), ROOTS)).toEqual({
      kind: 'file', path: path.join(ROOTS.home, 'rows.csv'),
    });
  });

  // The expansion happens before the comparison, so a tilde path is measured by where it lands rather
  // than by the two characters it starts with.
  it('expands a tilde path before deciding, and accepts it when it lands in the home', () => {
    expect(parseSource('~/rows.csv', ROOTS)).toEqual({
      kind: 'file', path: path.join(ROOTS.home, 'rows.csv'),
    });
  });

  it('refuses a path into a system directory, naming the two roots it would have to be under', () => {
    expect(parseSource('/etc/hosts', ROOTS)).toEqual({
      error: '/etc/hosts is outside the project directory and your home directory, and a data source may only be read from one of those',
    });
  });

  // A `..` is measured against the roots, not against the string. The roots here are a narrow pair
  // neither of which covers the other, so climbing out of one lands somewhere neither accepts — which
  // is what makes it a traversal test rather than another "inside the home" test. Neither directory
  // has to exist: classification is pure.
  it('refuses a traversal that climbs out of the root it started from', () => {
    const narrow = { project: '/etc/janissary-narrow', home: '/etc/janissary-narrow-home' };
    const climbing = '/etc/janissary-narrow/../elsewhere.csv';
    expect('error' in parseSource(climbing, narrow)).toBe(true);
  });

  // A prefix comparison that ignored the path boundary would read `/home/alice-backup/rows.csv` as
  // being inside `/home/alice`, which on a shared machine is somebody else's directory.
  it('does not treat a sibling with a shared prefix as being inside the root', () => {
    expect('error' in parseSource(`${ROOTS.home}-backup/rows.csv`, ROOTS)).toBe(true);
  });
});

// The reader resolves a symlink before it reads, so a link inside a root cannot be used to reach
// outside one. This is proved through the reader rather than through the parser, because the reader is
// where the resolution actually happens.
//
// The link points at a real system file rather than at a temporary one on purpose: a temporary
// directory on this machine is itself inside the home directory, so a link to one would be inside a
// root and the case would not test anything.
describe('a symlink out of a root is refused by the reader', () => {
  it('refuses a link inside the project that points at a file outside both roots', async () => {
    const link = path.join(ROOTS.project, 'janissary-linked-source.csv');
    symlinkSync('/etc/hosts', link);
    try {
      await expect(readSource(link, ROOTS)).resolves.toEqual({
        error: `${link} resolves outside the project directory and your home directory`,
      });
    } finally {
      rmSync(link, { force: true });
    }
  });
});

// A slash in the middle of a word is a ratio as often as it is a separator, and reading it as a path is
// how a question became a refused source and left the model with nothing to chart. The address has to
// begin at a word boundary, which every real path in a sentence does.
describe('an address inside a sentence', () => {
  it('finds a url wherever the sentence puts it', () => {
    expect(addressIn('the data is at https://example.com/a.csv thanks')).toBe('https://example.com/a.csv');
  });

  it('finds a path at the start of a word', () => {
    expect(addressIn('plot /tmp/data.csv for me')).toBe('/tmp/data.csv');
    expect(addressIn('plot ~/data/a.csv for me')).toBe('~/data/a.csv');
    expect(addressIn('/tmp/data.csv is what I want')).toBe('/tmp/data.csv');
    expect(addressIn('see ("/tmp/a.csv")')).toBe('/tmp/a.csv');
  });

  it('does not read a slash in the middle of a word as a path', () => {
    expect(addressIn('plot revenue/employee by region')).toBeUndefined();
    expect(addressIn('compare cost/benefit over time')).toBeUndefined();
  });

  it('finds nothing in a sentence that names no address', () => {
    expect(addressIn('what does the data say?')).toBeUndefined();
  });
});
