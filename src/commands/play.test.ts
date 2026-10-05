import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { command, parsePlay, PLAY_USAGE } from './play.js';

const tabs = [{ label: 'janus' }] as unknown as Tab[];

function makeManagers() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'play-command-'));
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

describe('play command matching', () => {
  it('claims the keyword whatever its case', () => {
    expect(command.match('play')).toBe(true);
    expect(command.match('PLAY devbox.cast')).toBe(true);
  });

  it('leaves a longer word that merely starts with it alone', () => {
    expect(command.match('player 3')).toBe(false);
  });
});

describe('parsePlay', () => {
  // The rest of the line is the target verbatim, because a path may hold a space and there is only
  // one form of this command, so nothing else has to be ruled out of it.
  it('takes everything after the keyword as the target', () => {
    expect(parsePlay('play my session.cast')).toEqual({ target: 'my session.cast' });
  });

  it('tolerates extra whitespace between the keyword and the target', () => {
    expect(parsePlay('play   devbox.cast')).toEqual({ target: 'devbox.cast' });
  });

  it('reports the usage when no target follows the keyword', () => {
    expect(parsePlay('play')).toEqual({ error: PLAY_USAGE });
    expect(parsePlay('play   ')).toEqual({ error: PLAY_USAGE });
  });
});

describe('play command run', () => {
  it('records the typed line and then hands the target to the owning plugin', () => {
    const { managers, append, runOpener, cwd } = makeManagers();
    const file = recording(cwd, 'devbox.cast');

    command.run('play devbox.cast', { label: 'janus', index: 0 }, managers);

    expect(append).toHaveBeenCalledWith('janus', { input: 'play devbox.cast', output: '' });
    expect(runOpener).toHaveBeenCalledWith(
      'asciicast', 'inline', file, { label: 'janus', command: 'play devbox.cast' },
    );
  });

  // A command the user just typed answers in the transcript it was typed into, the way `open` and
  // `video` report theirs — so the refusal is a second entry, not a notification.
  it('records a refusal as its own transcript entry and opens nothing', () => {
    const { managers, append, runOpener, cwd } = makeManagers();
    recording(cwd, 'devbox.cast');

    command.run('play notes.txt', { label: 'janus', index: 0 }, managers);

    expect(append).toHaveBeenNthCalledWith(1, 'janus', { input: 'play notes.txt', output: '' });
    expect(append).toHaveBeenNthCalledWith(2, 'janus', { input: '', output: 'play: notes.txt: not a playable file' });
    expect(runOpener).not.toHaveBeenCalled();
  });

  it('reports the usage line when the keyword arrives with no target', () => {
    const { managers, append, runOpener } = makeManagers();

    command.run('play', { label: 'janus', index: 0 }, managers);

    expect(append).toHaveBeenNthCalledWith(2, 'janus', { input: '', output: PLAY_USAGE });
    expect(runOpener).not.toHaveBeenCalled();
  });
});