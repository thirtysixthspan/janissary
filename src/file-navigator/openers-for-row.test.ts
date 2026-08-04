import { describe, it, expect } from 'vitest';
import { openersForRow } from './openers-for-row.js';

describe('openersForRow', () => {
  it('uses the opener declaration edit gesture instead of a plugin-name special case', () => {
    expect(openersForRow('/root', 'media/clip.mp4', false)).toEqual({ command: 'open', choices: [] });
    expect(openersForRow('/root', 'media/clip.mp4', true)).toEqual({ command: 'open external', choices: [] });
    expect(openersForRow('/root', 'media/clip.MOV', true)).toEqual({ command: 'open external', choices: [] });
  });

  it('routes a container the browser cannot decode the same way', () => {
    expect(openersForRow('/root', 'media/show.mkv', true)).toEqual({ command: 'open external', choices: [] });
  });

  it('keeps the plain-text editor for the edit gesture on a non-video claimed row', () => {
    expect(openersForRow('/root', 'src/main.ts', true)).toEqual({ command: 'edit', choices: [] });
    expect(openersForRow('/root', 'docs/readme.md', true)).toEqual({ command: 'edit', choices: [] });
  });

  it('still offers the two-choice chooser for a row no opener claims', () => {
    const result = openersForRow('/root', 'archive.tar.gz', false);
    expect(result.command).toBeUndefined();
    expect(result.choices).toEqual([
      { label: 'Edit as text', command: 'edit' },
      { label: 'Open externally', command: 'open external' },
    ]);
  });

  it('forces a claimed row into a three-choice chooser led by its own opener', () => {
    const result = openersForRow('/root', 'docs/readme.md', false, true);
    expect(result.command).toBeUndefined();
    expect(result.choices).toEqual([
      { label: 'Open as markdown', command: 'open' },
      { label: 'Edit as text', command: 'edit' },
      { label: 'Open externally', command: 'open external' },
    ]);
  });

  it('gives an inverted edit gesture the same uniform forced chooser', () => {
    const result = openersForRow('/root', 'media/clip.mp4', true, true);
    expect(result.command).toBeUndefined();
    expect(result.choices[0]).toEqual({ label: 'Open as video', command: 'open' });
    expect(result.choices).toHaveLength(3);
  });

  it('leaves an unclaimed row unchanged when the chooser is forced', () => {
    expect(openersForRow('/root', 'archive.tar.gz', false, true))
      .toEqual(openersForRow('/root', 'archive.tar.gz', false));
  });

  it('leaves every resolution unchanged with the flag clear', () => {
    expect(openersForRow('/root', 'docs/readme.md', false, false)).toEqual({ command: 'open', choices: [] });
    expect(openersForRow('/root', 'docs/readme.md', true, false)).toEqual({ command: 'edit', choices: [] });
    expect(openersForRow('/root', 'media/clip.mp4', true, false)).toEqual({ command: 'open external', choices: [] });
  });
});
