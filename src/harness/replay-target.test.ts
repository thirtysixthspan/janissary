import { describe, expect, it } from 'vitest';
import { resolveReplayTarget, REPLAY_USAGE, type ReplayLookup } from './replay-target';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The rule is which of two forms a target is, and each form's own refusals. The filesystem is not
// stubbed: a lookup that answers from a real directory is what a path is, and the rule above it is
// what these cases are about.
function makeLookup(options: { label?: string; file?: string } = {}): ReplayLookup {
  return {
    forLabel: (label) => (options.label === label
      ? { path: `/recordings/${label}.cast` }
      : { error: `No recording found for "${label}".` }),
    forFile: (target) => (options.file && existsSync(target)
      ? { path: target }
      : { error: `No such recording file: ${target}.` }),
  };
}

describe('resolveReplayTarget', () => {
  it('reads a target with no .cast extension as a tab label', () => {
    const lookup = makeLookup({ label: 'devbox' });
    expect(resolveReplayTarget('devbox', lookup)).toEqual({ path: '/recordings/devbox.cast' });
  });

  it('reads a target ending in .cast as a path, whatever else it looks like', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'replay-target-'));
    const file = path.join(dir, 'devbox-2026-10-01T14-32-05-123Z.cast');
    writeFileSync(file, '{"version":3}\n');
    try {
      // A recording whose name reads like a label is still a path, because that is what it is.
      expect(resolveReplayTarget(file, makeLookup({ file }))).toEqual({ path: file });
      expect(resolveReplayTarget(file, makeLookup()).error)
        .toBe(`No such recording file: ${file}.`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('matches the extension case-insensitively, as the filesystem does', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'replay-target-'));
    const file = path.join(dir, 'SESSION.CAST');
    writeFileSync(file, '{"version":3}\n');
    try {
      expect(resolveReplayTarget(file, makeLookup({ file }))).toEqual({ path: file });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses an empty target with the usage line, rather than resolving it to something', () => {
    expect(resolveReplayTarget(' '.repeat(3), makeLookup()).error).toBe(REPLAY_USAGE);
  });

  it('reports each form\'s own refusal rather than one message for both', () => {
    expect(resolveReplayTarget('nope', makeLookup()).error).toBe('No recording found for "nope".');
    expect(resolveReplayTarget('./missing.cast', makeLookup()).error)
      .toBe('No such recording file: ./missing.cast.');
  });

  it('trims a target, so a trailing space from the command line does not defeat the extension rule', () => {
    const lookup = makeLookup({ label: 'devbox' });
    expect(resolveReplayTarget('  devbox  ', lookup)).toEqual({ path: '/recordings/devbox.cast' });
  });
});