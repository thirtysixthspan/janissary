import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { catalogRunscripts, createRunscript, readRunscript } from './runscript-files.js';

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

  it('creates a missing scripts directory and an empty runscript in it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule create '));
    try {
      const created = createRunscript(root, 'deploy');

      expect(created).toEqual({ file: path.join(root, '.janissary', 'scripts', 'deploy.rs'), created: true });
      expect(readFileSync(created.file, 'utf8')).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps an existing runscript unchanged and reports that it was not created', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule create '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(scripts, 'deploy.rs'), 'echo kept\n');

      expect(createRunscript(root, 'deploy')).toEqual({ file: path.join(scripts, 'deploy.rs'), created: false });
      expect(readFileSync(path.join(scripts, 'deploy.rs'), 'utf8')).toBe('echo kept\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses an invalid name without creating anything', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule create '));
    try {
      expect(() => createRunscript(root, 'Deploy')).toThrow(/Invalid runscript name/);
      expect(existsSync(path.join(root, '.janissary'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to create through a symlinked scripts directory or a symlinked target', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule create '));
    try {
      mkdirSync(path.join(root, '.janissary'), { recursive: true });
      symlinkSync(root, path.join(root, '.janissary', 'scripts'));
      expect(() => createRunscript(root, 'deploy')).toThrow(/real directory/);
      expect(existsSync(path.join(root, 'deploy.rs'))).toBe(false);

      rmSync(path.join(root, '.janissary', 'scripts'));
      mkdirSync(path.join(root, '.janissary', 'scripts'));
      writeFileSync(path.join(root, 'target.rs'), 'echo unsafe');
      symlinkSync(path.join(root, 'target.rs'), path.join(root, '.janissary', 'scripts', 'deploy.rs'));
      expect(() => createRunscript(root, 'deploy')).toThrow(/regular file/);
      expect(readFileSync(path.join(root, 'target.rs'), 'utf8')).toBe('echo unsafe');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
