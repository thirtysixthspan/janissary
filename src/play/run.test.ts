import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { runPlay } from './run.js';

const cwd = mkdtempSync(path.join(tmpdir(), 'play-cwd-'));

const tabs = [{ label: 'janus', log: [] }] as unknown as Tab[];

function makeManagers() {
  const runOpener = vi.fn(async () => {});
  const append = vi.fn();
  const managers = {
    tab: {
      tabs,
      cur: () => tabs[0],
      cwdOf: () => cwd,
      launchDir: cwd,
      append,
    },
    plugins: { runOpener },
  } as unknown as Managers;
  return { managers, runOpener, append };
}

function recording(name: string): string {
  const file = path.join(cwd, name);
  writeFileSync(file, '{"version":3,"term":{"cols":80,"rows":24}}\n');
  return file;
}

describe('runPlay', () => {
  it('routes a recording into the plugin that owns its type, through the guarded opener path', () => {
    const { managers, runOpener } = makeManagers();
    const file = recording('devbox.cast');
    expect(runPlay(managers, 'play devbox.cast', 'janus')).toBeUndefined();
    expect(runOpener).toHaveBeenCalledWith(
      'asciicast', 'inline', file, { label: 'janus', command: 'play devbox.cast' },
    );
  });

  // The two forms of a path `open` and `edit` already resolve, so `play` cannot accept one of them and
  // quietly read the other: a relative target is against the invoking tab's cwd, an absolute one is not.
  it('resolves a relative target against the tab cwd and an absolute one against itself', () => {
    const { managers, runOpener } = makeManagers();
    const file = recording('absolute.cast');
    runPlay(managers, 'play absolute.cast', 'janus');
    runPlay(managers, `play ${file}`, 'janus');
    expect(runOpener.mock.calls.map((call) => call[2])).toEqual([file, file]);
  });

  it('takes the target whole, so a path holding a space resolves', () => {
    const { managers, runOpener } = makeManagers();
    const file = recording('my session.cast');
    runPlay(managers, 'play my session.cast', 'janus');
    expect(runOpener).toHaveBeenCalledWith('asciicast', 'inline', file, expect.anything());
  });

  it('reads the extension case-insensitively, as every other opener lookup does', () => {
    const { managers, runOpener } = makeManagers();
    const file = recording('shouty.CAST');
    runPlay(managers, 'play shouty.CAST', 'janus');
    expect(runOpener).toHaveBeenCalledWith('asciicast', 'inline', file, expect.anything());
  });

  it('refuses an extension no plugin claims', () => {
    const { managers, runOpener } = makeManagers();
    expect(runPlay(managers, 'play notes.txt', 'janus')).toBe('play: notes.txt: not a playable file');
    expect(runOpener).not.toHaveBeenCalled();
  });

  // The case that separates the plugin's own declaration from "any plugin opener": the image plugin
  // owns `.png`, and an image viewer is not a player, so the extension resolving to a plugin is not
  // enough on its own.
  it('refuses a plugin-owned extension whose types the plugin has not declared playable', () => {
    const { managers, runOpener } = makeManagers();
    expect(runPlay(managers, 'play photo.png', 'janus')).toBe('play: photo.png: not a playable file');
    expect(runOpener).not.toHaveBeenCalled();
  });

  it("refuses a missing file in `open`'s wording, before asking the plugin for anything", () => {
    const { managers, runOpener } = makeManagers();
    expect(runPlay(managers, 'play gone.cast', 'janus'))
      .toBe(`play: ${path.join(cwd, 'gone.cast')}: no such file`);
    expect(runOpener).not.toHaveBeenCalled();
  });

  it('reports the usage line for a bare play', () => {
    const { managers, runOpener } = makeManagers();
    expect(runPlay(managers, 'play', 'janus')).toBe('Usage: play <file>.');
    expect(runPlay(managers, 'play   ', 'janus')).toBe('Usage: play <file>.');
    expect(runOpener).not.toHaveBeenCalled();
  });
});