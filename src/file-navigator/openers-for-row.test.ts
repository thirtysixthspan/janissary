import { describe, it, expect } from 'vitest';
import { openersForRow } from './openers-for-row.js';

describe('openersForRow', () => {
  it('resolves a video row to `open` on plain activation and `open external` on the edit gesture', () => {
    expect(openersForRow('/root', 'media/clip.mp4', false)).toEqual({ command: 'open', choices: [] });
    expect(openersForRow('/root', 'media/clip.mp4', true)).toEqual({ command: 'open external', choices: [] });
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
});
