import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listHelpPages, readHelpPage } from './help-pages.js';

describe('help pages', () => {
  it('lists markdown page names alphabetically and reads only listed pages', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'help-pages-'));
    try {
      writeFileSync(path.join(directory, 'keys.md'), 'Keys');
      writeFileSync(path.join(directory, 'commands.md'), 'Commands');
      writeFileSync(path.join(directory, 'quit.md'), 'Quit help');
      expect(listHelpPages(directory)).toEqual(['commands', 'keys', 'quit']);
      expect(readHelpPage(directory, 'quit')).toEqual({ kind: 'page', text: 'Quit help' });
      expect(readHelpPage(directory, '/quit')).toEqual({ kind: 'page', text: 'Quit help' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['//quit', '../package', 'a/b', 'nosuch'])(
    'does not resolve an unlisted path: %s',
    (query) => {
      const parent = mkdtempSync(path.join(tmpdir(), 'help-pages-'));
      const directory = path.join(parent, 'help');
      mkdirSync(directory);
      writeFileSync(path.join(directory, 'commands.md'), 'Commands');
      writeFileSync(path.join(parent, 'package.md'), 'Outside');
      try {
        expect(readHelpPage(directory, query)).toEqual({ kind: 'missing', name: query.replace(/^\//, '') });
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    },
  );

  it('reports unreadable help when the directory or required commands page is missing', () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'help-pages-'));
    const directory = path.join(parent, 'help');
    mkdirSync(directory);
    writeFileSync(path.join(directory, 'quit.md'), 'Quit help');
    try {
      expect(listHelpPages(path.join(parent, 'missing'))).toEqual([]);
      expect(readHelpPage(path.join(parent, 'missing'), 'quit')).toEqual({ kind: 'unreadable' });
      expect(readHelpPage(directory, 'quit')).toEqual({ kind: 'unreadable' });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('reports a listed page that cannot be read as unreadable', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'help-pages-'));
    try {
      writeFileSync(path.join(directory, 'commands.md'), 'Commands');
      symlinkSync(path.join(directory, 'missing-target.md'), path.join(directory, 'quit.md'));
      expect(readHelpPage(directory, 'quit')).toEqual({ kind: 'unreadable' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
