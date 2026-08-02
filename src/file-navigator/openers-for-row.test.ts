import { describe, it, expect } from 'vitest';
import { openerForExtension } from '../openers/index.js';
import { videoManifest } from '../plugins/video/manifest.js';
import { openersForRow } from './openers-for-row.js';

describe('openersForRow', () => {
  // The inverted edit gesture comes from the declaration's `editAction`, not from the opener being
  // named 'video', so every container the manifest claims gets it — including the ones no `<video>`
  // element can decode, which have nothing to edit as text either.
  it('resolves every extension the video declaration claims from its declared edit action', () => {
    for (const extension of videoManifest.opener.extensions) {
      expect(openerForExtension(extension)?.plugin?.editAction).toBe('open external');
      expect(openersForRow('/root', `media/clip${extension}`, false)).toEqual({ command: 'open', choices: [] });
      expect(openersForRow('/root', `media/clip${extension}`, true)).toEqual({ command: 'open external', choices: [] });
    }
  });

  it('matches a claimed extension case-insensitively', () => {
    expect(openersForRow('/root', 'media/CLIP.MP4', true)).toEqual({ command: 'open external', choices: [] });
  });

  it('keeps the plain-text editor for the edit gesture on a claimed row that declares no edit action', () => {
    expect(openerForExtension('.ts')?.plugin?.editAction).toBeUndefined();
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
