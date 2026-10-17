import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { catalogRunscripts, readRunscript } from './runscript-files.js';

describe('runscript files', () => {
  it('reads current contents, reports the exact missing path and catalogs valid regular files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule scripts '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(scripts, 'z.rs'), 'echo old\n');
      writeFileSync(path.join(scripts, 'Bad.rs'), 'ignored\n');
      writeFileSync(path.join(scripts, 'a.txt'), 'ignored\n');
      expect(catalogRunscripts(root)).toEqual(['z']);
      expect(readRunscript(root, 'missing')).toEqual({ file: path.join(scripts, 'missing.rs'), exists: false, lines: [] });
      writeFileSync(path.join(scripts, 'z.rs'), 'echo new\n');
      expect(readRunscript(root, 'z').lines).toEqual(['echo new']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects symlinked directories and target files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule symlinks '));
    try {
      mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
      writeFileSync(path.join(root, 'target.rs'), 'echo unsafe');
      symlinkSync(path.join(root, 'target.rs'), path.join(root, '.janissary', 'scripts', 'link.rs'));
      expect(() => readRunscript(root, 'link')).toThrow(/regular file/);
      const scripts = path.join(root, '.janissary', 'scripts');
      rmSync(scripts, { recursive: true });
      symlinkSync(root, scripts);
      expect(() => catalogRunscripts(root)).toThrow(/real directory/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
