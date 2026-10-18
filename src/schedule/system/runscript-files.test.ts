import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as NodeFs from 'node:fs';
import type * as NextFreeName from '../../editor/next-free-name.js';
import { nextFreeName } from '../../editor/next-free-name.js';
import { catalogRunscripts, cloneRunscript, createRunscript, deleteRunscript, ensureScriptsDirectory, listRunscriptNames, newUntitledRunscript, readRunscript } from './runscript-files.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, unlinkSync: vi.fn(actual.unlinkSync) };
});

vi.mock('../../editor/next-free-name.js', async (importOriginal) => {
  const actual = await importOriginal<typeof NextFreeName>();
  return { nextFreeName: vi.fn(actual.nextFreeName) };
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

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
      expect(readRunscript(root, 'missing')).toEqual({ file: path.join(scripts, 'missing.rs'), exists: false, lines: [], text: '' });
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

  it('ensures the scripts directory exists and changes nothing on a second call', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule ensure '));
    try {
      ensureScriptsDirectory(root);
      const scripts = path.join(root, '.janissary', 'scripts');
      expect(readdirSync(scripts)).toEqual([]);
      writeFileSync(path.join(scripts, 'deploy.rs'), 'echo kept\n');
      ensureScriptsDirectory(root);
      expect(readdirSync(scripts)).toEqual(['deploy.rs']);
      expect(readFileSync(path.join(scripts, 'deploy.rs'), 'utf8')).toBe('echo kept\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates the scripts directory at the path the reads and writes use', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule ensure path '));
    try {
      ensureScriptsDirectory(root);
      const scripts = path.join(root, '.janissary', 'scripts');
      expect(lstatSync(scripts).isDirectory()).toBe(true);
      expect(readRunscript(root, 'deploy').file).toBe(path.join(scripts, 'deploy.rs'));
      expect(createRunscript(root, 'deploy')).toEqual({ file: path.join(scripts, 'deploy.rs'), created: true });
      expect(readdirSync(scripts)).toEqual(['deploy.rs']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a symlinked state directory, reports the exclusion failure and creates nothing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule ensure symlink '));
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const elsewhere = path.join(root, 'elsewhere');
      mkdirSync(elsewhere);
      symlinkSync(elsewhere, path.join(root, '.janissary'));
      expect(() => ensureScriptsDirectory(root)).toThrow(/real directory/);
      expect(write).toHaveBeenCalledWith(expect.stringContaining('could not be excluded from Git'));
      expect(readdirSync(elsewhere)).toEqual([]);
    } finally {
      write.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('excludes the scripts directory from Git when it is ensured in a repository', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule ensure git '));
    try {
      git(root, 'init', '-q');
      ensureScriptsDirectory(root);
      expect(git(root, 'check-ignore', '--quiet', '--', '.janissary/scripts/')).toBe('');
      expect(readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8').split('\n')).toContain('/.janissary/scripts');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lists sorted valid runscript names and writes no Git exclusion', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule list git '));
    try {
      git(root, 'init', '-q');
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(scripts, 'zeta.rs'), 'echo zeta\n');
      writeFileSync(path.join(scripts, 'alpha.rs'), 'echo alpha\n');
      writeFileSync(path.join(scripts, 'Bad.rs'), 'ignored\n');
      writeFileSync(path.join(scripts, 'notes.txt'), 'ignored\n');
      mkdirSync(path.join(scripts, 'folder.rs'));
      symlinkSync(path.join(scripts, 'alpha.rs'), path.join(scripts, 'link.rs'));
      const excludeFile = path.join(root, '.git', 'info', 'exclude');
      const originalExclude = readFileSync(excludeFile, 'utf8');

      expect(listRunscriptNames(root)).toEqual(['alpha', 'zeta']);
      expect(readFileSync(excludeFile, 'utf8')).toBe(originalExclude);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns the raw text with comments, blank lines and CRLF endings while parsing the same lines', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule text '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      const text = '# header\r\n\r\necho one # inline\r\n  \r\necho two\r\n';
      writeFileSync(path.join(scripts, 'deploy.rs'), text);

      const read = readRunscript(root, 'deploy');
      expect(read.text).toBe(text);
      expect(read.lines).toEqual(['echo one # inline', 'echo two']);
      expect(readRunscript(root, 'missing').text).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('deletes a regular runscript once and reports an absent one as not removed', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule delete '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(scripts, 'deploy.rs'), 'echo deploy\n');

      expect(deleteRunscript(root, 'deploy')).toBe(true);
      expect(existsSync(path.join(scripts, 'deploy.rs'))).toBe(false);
      expect(deleteRunscript(root, 'deploy')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to delete a symlink or a non-regular entry and leaves it in place', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule delete unsafe '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(root, 'target.rs'), 'echo unsafe');
      symlinkSync(path.join(root, 'target.rs'), path.join(scripts, 'link.rs'));
      mkdirSync(path.join(scripts, 'folder.rs'));

      expect(() => deleteRunscript(root, 'link')).toThrow(/regular file/);
      expect(() => deleteRunscript(root, 'folder')).toThrow(/regular file/);
      expect(readFileSync(path.join(root, 'target.rs'), 'utf8')).toBe('echo unsafe');
      expect(lstatSync(path.join(scripts, 'link.rs')).isSymbolicLink()).toBe(true);
      expect(lstatSync(path.join(scripts, 'folder.rs')).isDirectory()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a runscript removed by another process between the check and the unlink as not removed', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule delete race '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      const file = path.join(scripts, 'deploy.rs');
      writeFileSync(file, 'echo deploy\n');
      vi.mocked(unlinkSync).mockImplementationOnce((target) => {
        rmSync(target);
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      });

      expect(deleteRunscript(root, 'deploy')).toBe(false);
      expect(unlinkSync).toHaveBeenCalledWith(file);
      expect(existsSync(file)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('clones a runscript byte for byte to the next free name', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule clone '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      const text = '# keep\r\n\r\necho deploy # inline\n';
      writeFileSync(path.join(scripts, 'deploy.rs'), text);

      expect(cloneRunscript(root, 'deploy')).toBe('deploy-2');
      expect(readFileSync(path.join(scripts, 'deploy-2.rs'), 'utf8')).toBe(text);
      expect(cloneRunscript(root, 'deploy')).toBe('deploy-3');
      expect(readFileSync(path.join(scripts, 'deploy-3.rs'), 'utf8')).toBe(text);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns undefined for a missing clone source and creates nothing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule clone missing '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });

      expect(cloneRunscript(root, 'missing')).toBeUndefined();
      expect(readdirSync(scripts)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to clone a symlinked source and writes no copy', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule clone unsafe '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(root, 'target.rs'), 'echo unsafe');
      symlinkSync(path.join(root, 'target.rs'), path.join(scripts, 'link.rs'));

      expect(() => cloneRunscript(root, 'link')).toThrow(/regular file/);
      expect(existsSync(path.join(scripts, 'link-2.rs'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws on a dangling symlink at the target, leaves it untouched and never tries the next number', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule clone dangling '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(scripts, 'deploy.rs'), 'echo deploy\n');
      symlinkSync(path.join(root, 'missing-target.rs'), path.join(scripts, 'deploy-2.rs'));

      expect(() => cloneRunscript(root, 'deploy')).toThrow(/already exists/);
      expect(lstatSync(path.join(scripts, 'deploy-2.rs')).isSymbolicLink()).toBe(true);
      expect(existsSync(path.join(root, 'missing-target.rs'))).toBe(false);
      expect(existsSync(path.join(scripts, 'deploy-3.rs'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('never overwrites an existing file when the chosen clone name is already taken', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule clone race '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(scripts, 'deploy.rs'), 'echo source\n');
      writeFileSync(path.join(scripts, 'deploy-2.rs'), 'echo kept\n');
      vi.mocked(nextFreeName).mockReturnValueOnce('deploy-2.rs');

      expect(() => cloneRunscript(root, 'deploy')).toThrow(/already exists/);
      expect(readFileSync(path.join(scripts, 'deploy-2.rs'), 'utf8')).toBe('echo kept\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates untitled runscripts under the next free name', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule untitled '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');

      expect(newUntitledRunscript(root)).toBe('untitled');
      expect(newUntitledRunscript(root)).toBe('untitled-2');
      expect(readFileSync(path.join(scripts, 'untitled.rs'), 'utf8')).toBe('');
      expect(readFileSync(path.join(scripts, 'untitled-2.rs'), 'utf8')).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns a name that appears before its write without overwriting the file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule untitled race '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      vi.mocked(nextFreeName).mockImplementationOnce((dir, name) => {
        writeFileSync(path.join(dir, name), 'echo kept\n');
        return name;
      });

      expect(newUntitledRunscript(root)).toBe('untitled');
      expect(readFileSync(path.join(scripts, 'untitled.rs'), 'utf8')).toBe('echo kept\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('names the untitled runscript in the error when a dangling symlink blocks the create and leaves the link in place', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule untitled dangling '));
    try {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      const link = path.join(scripts, 'untitled.rs');
      symlinkSync(path.join(root, 'missing-target.rs'), link);

      let failure: unknown;
      try {
        newUntitledRunscript(root);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ message: expect.stringMatching(/regular file/), runscriptName: 'untitled' });
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws for a symlinked state directory before choosing a name and creates nothing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule untitled symlink '));
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const elsewhere = path.join(root, 'elsewhere');
      mkdirSync(elsewhere);
      symlinkSync(elsewhere, path.join(root, '.janissary'));
      vi.mocked(nextFreeName).mockClear();

      expect(() => newUntitledRunscript(root)).toThrow(/real directory/);
      expect(nextFreeName).not.toHaveBeenCalled();
      expect(readdirSync(elsewhere)).toEqual([]);
    } finally {
      write.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
