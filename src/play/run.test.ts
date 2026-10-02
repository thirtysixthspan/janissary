import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { initHarnessRecordingDirectory } from '../harness/recording-file.js';
import { runPlay } from './run.js';

const project = mkdtempSync(path.join(tmpdir(), 'play-project-'));
initHarnessRecordingDirectory(project);

const tabs = [{ label: 'janus', log: [] }] as unknown as Tab[];

// A working directory of its own per case: these cases decide whether a file is there, and one that
// inherits a neighbour's file is testing the neighbour.
function makeManagers() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'play-cwd-'));
  const runOpener = vi.fn(async () => {});
  const append = vi.fn();
  const managers = {
    tab: { tabs, cur: () => tabs[0], cwdOf: () => cwd, launchDir: cwd, append },
    plugins: { runOpener },
  } as unknown as Managers;
  return { managers, runOpener, append, cwd };
}

const CAST = '{"version":3,"term":{"cols":80,"rows":24}}\n';

function recording(cwd: string, name: string): string {
  const file = path.join(cwd, name);
  writeFileSync(file, CAST);
  return file;
}

// A recording in the project's recordings directory, which is where every session's file actually goes
// and therefore the only place the fallback may look.
function archived(name: string): string {
  const directory = path.join(project, '.janissary', 'recordings');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), CAST);
  return path.join(directory, name);
}

describe('runPlay', () => {
  it('routes a recording into the plugin that owns its type, through the guarded opener path', () => {
    const { managers, runOpener, cwd } = makeManagers();
    const file = recording(cwd, 'devbox.cast');
    expect(runPlay(managers, 'play devbox.cast', 'janus')).toBeUndefined();
    expect(runOpener).toHaveBeenCalledWith(
      'asciicast', 'inline', file, { label: 'janus', command: 'play devbox.cast' },
    );
  });

  // The two forms of a path `open` and `edit` already resolve, so `play` cannot accept one of them and
  // quietly read the other: a relative target is against the invoking tab's cwd, an absolute one is not.
  it('resolves a relative target against the tab cwd and an absolute one against itself', () => {
    const { managers, runOpener, cwd } = makeManagers();
    const file = recording(cwd, 'absolute.cast');
    runPlay(managers, 'play absolute.cast', 'janus');
    runPlay(managers, `play ${file}`, 'janus');
    expect(runOpener.mock.calls.map((call) => call[2])).toEqual([file, file]);
  });

  it('takes the target whole, so a path holding a space resolves', () => {
    const { managers, runOpener, cwd } = makeManagers();
    const file = recording(cwd, 'my session.cast');
    runPlay(managers, 'play my session.cast', 'janus');
    expect(runOpener).toHaveBeenCalledWith('asciicast', 'inline', file, expect.anything());
  });

  it('reads the extension case-insensitively, as every other opener lookup does', () => {
    const { managers, runOpener, cwd } = makeManagers();
    const file = recording(cwd, 'shouty.CAST');
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
    const { managers, runOpener, cwd } = makeManagers();
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

// The recorder appends a timestamp to every recording's name, so the file's own name is the one thing
// a user does not have. These cases are the fallback that makes a recording reachable without it.
describe('runPlay — the recordings directory fallback', () => {
  it('reaches a recording by the name the user knows, from a cwd that has no such file', () => {
    const { managers, runOpener } = makeManagers();
    const file = archived('buildbox-2026-07-10T18-30-05-123Z.cast');
    runPlay(managers, 'play buildbox.cast', 'janus');
    expect(runOpener).toHaveBeenCalledWith('asciicast', 'inline', file, expect.anything());
  });

  it('reaches a recording by its bare label, which carries no extension at all', () => {
    const { managers, runOpener } = makeManagers();
    const file = archived('cursor-2026-07-10T18-30-05-123Z.cast');
    runPlay(managers, 'play cursor', 'janus');
    expect(runOpener).toHaveBeenCalledWith('asciicast', 'inline', file, expect.anything());
  });

  it('reaches the most recent of several recordings of one session', () => {
    const { managers, runOpener } = makeManagers();
    archived('repeat-2026-07-10T18-30-05-123Z.cast');
    const newer = archived('repeat-2026-07-10T21-04-11-004Z.cast');
    runPlay(managers, 'play repeat', 'janus');
    expect(runOpener).toHaveBeenCalledTimes(1);
    expect(runOpener).toHaveBeenLastCalledWith('asciicast', 'inline', newer, expect.anything());
  });

  // The fallback is a fallback: a path that is there is what the user asked for, whatever else the
  // recordings directory happens to hold under the same name.
  it('still plays an existing path as written, without looking for a recording of that name', () => {
    const { managers, runOpener, cwd } = makeManagers();
    archived('mason-2026-07-10T18-30-05-123Z.cast');
    const file = recording(cwd, 'mason.cast');
    runPlay(managers, 'play mason.cast', 'janus');
    expect(runOpener).toHaveBeenCalledWith('asciicast', 'inline', file, expect.anything());
  });

  it('reports no such file when neither the path nor a recording of that name is there', () => {
    const { managers, runOpener, cwd } = makeManagers();
    expect(runPlay(managers, 'play nowhere.cast', 'janus'))
      .toBe(`play: ${path.join(cwd, 'nowhere.cast')}: no such file`);
    expect(runPlay(managers, 'play nowhere', 'janus'))
      .toBe(`play: ${path.join(cwd, 'nowhere')}: no such file`);
    expect(runOpener).not.toHaveBeenCalled();
  });

  // The type rule is answered before any file question is asked, so no recording can make a named
  // extension playable.
  it('still refuses a named extension by type, whatever the recordings directory holds', () => {
    const { managers, runOpener } = makeManagers();
    archived('navy-2026-07-10T18-30-05-123Z.cast');
    expect(runPlay(managers, 'play notes.txt', 'janus')).toBe('play: notes.txt: not a playable file');
    expect(runPlay(managers, 'play photo.png', 'janus')).toBe('play: photo.png: not a playable file');
    expect(runPlay(managers, 'play navy-2.txt', 'janus'))
      .toBe('play: navy-2.txt: not a playable file');
    expect(runOpener).not.toHaveBeenCalled();
  });
});