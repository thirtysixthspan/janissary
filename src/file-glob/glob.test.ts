import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FILE_GLOB_USAGE, parseFileGlob } from './command.js';
import { globWorkspace, globWorkspaceCommand } from './glob.js';

const TIMEOUT_LINE = '(search stopped after 30 seconds; narrow the pattern or --path)';

function write(root: string, relative: string, content = 'x'): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function initRepo(root: string): void {
  execSync('git init', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: root, stdio: 'pipe' });
}

describe('globWorkspace', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'file-glob-entry-')); });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function glob(rest: string, deadline = Date.now() + 60_000): Promise<string> {
    const parsed = parseFileGlob(`file glob ${rest}`);
    if ('error' in parsed) throw new Error(parsed.error);
    return globWorkspace(root, parsed, deadline);
  }

  describe('patterns', () => {
    beforeEach(() => {
      for (const file of ['a.ts', 'b.js', 'c.md', 'src/x.ts', 'src/deep/y.ts']) write(root, file);
    });

    it('matches across folders with **', async () => {
      expect(await glob('**/*.ts')).toBe('a.ts\nsrc/deep/y.ts\nsrc/x.ts');
    });

    it('stays within one name with *', async () => {
      expect(await glob('*.ts')).toBe('a.ts');
    });

    it('matches one character with ?', async () => {
      expect(await glob('?.js')).toBe('b.js');
    });

    it('matches either alternative with {a,b}', async () => {
      expect(await glob('*.{js,md}')).toBe('b.js\nc.md');
    });

    it('is case-sensitive', async () => {
      expect(await glob('*.TS')).toBe('(no matches)');
    });

    it('prints (no matches) for a pattern with no hits', async () => {
      expect(await glob('*.rs')).toBe('(no matches)');
    });
  });

  describe('--path anchoring', () => {
    beforeEach(() => {
      write(root, 'top.ts');
      write(root, 'src/a.ts');
      write(root, 'src/x/b.ts');
    });

    it('anchors the pattern to --path and prints root-relative paths', async () => {
      expect(await glob('*.ts --path src')).toBe('src/a.ts');
    });

    it('treats --path . like no --path', async () => {
      expect(await glob('**/*.ts --path .')).toBe(await glob('**/*.ts'));
      expect(await glob('**/*.ts --path .')).toBe('src/a.ts\nsrc/x/b.ts\ntop.ts');
    });

    it('accepts a trailing slash on --path', async () => {
      expect(await glob('*.ts --path src/')).toBe('src/a.ts');
    });
  });

  describe('pruning', () => {
    it('prunes dotfiles and node_modules without --hidden', async () => {
      for (const file of ['.eslintrc.json', '.github/ci.yml', 'node_modules/p/i.js', 'a.ts']) write(root, file);
      expect(await glob('**/*')).toBe('a.ts');
    });

    it('lists dotfiles under --hidden but omits secret files', async () => {
      for (const file of ['.eslintrc.json', '.github/ci.yml', '.env.example', 'a.ts']) write(root, file);
      expect(await glob('**/* --hidden')).toBe('.eslintrc.json\n.github/ci.yml\na.ts');
    });

    it('matches .* only under --hidden', async () => {
      write(root, '.eslintrc.json');
      expect(await glob('.* --hidden')).toBe('.eslintrc.json');
      expect(await glob('.*')).toBe('(no matches)');
    });

    it('never lists .git', async () => {
      write(root, '.git/HEAD');
      write(root, 'a.ts');
      expect(await glob('**/* --hidden')).toBe('a.ts');
    });

    it('omits secret files without counting them toward the limit', async () => {
      write(root, '.env');
      write(root, 'a.ts');
      expect(await glob('* --hidden --limit 1')).toBe('a.ts');
    });

    it('does not honor .gitignore outside a repository and still skips node_modules', async () => {
      write(root, '.gitignore', 'a.ts\n');
      write(root, 'a.ts');
      write(root, 'node_modules/p/i.ts');
      expect(await glob('**/*.ts')).toBe('a.ts');
    });
  });

  describe('git-ignored paths', () => {
    beforeEach(() => {
      initRepo(root);
      write(root, '.gitignore', 'dist/\nsrc/gen/\n');
      for (const file of ['src/a.ts', 'src/gen/x.ts', 'dist/b.ts']) write(root, file);
    });

    it('prunes git-ignored paths', async () => {
      expect(await glob('**/*.ts')).toBe('src/a.ts');
    });

    it('lists git-ignored paths under --hidden', async () => {
      expect(await glob('**/*.ts --hidden')).toBe('dist/b.ts\nsrc/a.ts\nsrc/gen/x.ts');
    });

    it('loads the ignored set relative to the root, not to --path', async () => {
      expect(await glob('**/*.ts --path src')).toBe('src/a.ts');
    });

    it('lists the contents of a git-ignored folder named as --path', async () => {
      expect(await glob('* --path dist')).toBe('dist/b.ts');
    });

    it('prunes git-ignored paths by their real location under an in-root linked --path', async () => {
      symlinkSync('src', path.join(root, 'lnk'));
      expect(await glob('**/*.ts --path lnk')).toBe('lnk/a.ts');
      expect(await glob('**/*.ts --path lnk --hidden')).toBe('lnk/a.ts\nlnk/gen/x.ts');
    });

    describe('with a git lookup that outlasts the deadline', () => {
      let bin: string;

      beforeEach(() => {
        bin = mkdtempSync(path.join(tmpdir(), 'file-glob-git-'));
        writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nexec /bin/sleep 5\n', { mode: 0o755 });
        vi.stubEnv('PATH', bin);
      });
      afterEach(() => {
        vi.unstubAllEnvs();
        rmSync(bin, { recursive: true, force: true });
      });

      it('prints (no matches) and the timeout line instead of an unpruned listing', async () => {
        const started = Date.now();
        expect(await glob('**/*.ts', started + 200)).toBe(`(no matches)\n${TIMEOUT_LINE}`);
        expect(Date.now() - started).toBeLessThan(3000);
      });

      it('never consults git under --hidden', async () => {
        expect(await glob('**/*.ts --hidden', Date.now() + 2000)).toBe('dist/b.ts\nsrc/a.ts\nsrc/gen/x.ts');
      });

      it('kills the lookup and prints the timeout line when the signal aborts before the deadline', async () => {
        const parsed = parseFileGlob('file glob **/*.ts');
        if ('error' in parsed) throw new Error(parsed.error);
        const started = Date.now();
        expect(await globWorkspace(root, parsed, started + 60_000, AbortSignal.timeout(100))).toBe(`(no matches)\n${TIMEOUT_LINE}`);
        expect(Date.now() - started).toBeLessThan(3000);
      });
    });
  });

  describe('limit', () => {
    it('prints the truncation line when the limit ends the search', async () => {
      for (const file of ['a', 'b', 'c']) write(root, file);
      expect(await glob('* --limit 2')).toBe('a\nb\n(showing the first 2 matches; narrow the pattern or raise --limit)');
    });
  });

  describe('bad --path', () => {
    beforeEach(() => { write(root, 'a.ts'); });

    it('rejects an absolute path', async () => {
      const absolute = path.join(root, 'src');
      expect(await glob(`* --path ${absolute}`)).toBe(`Outside the workspace: ${absolute}.`);
    });

    it('rejects a .. escape', async () => {
      expect(await glob('* --path ../x')).toBe('Outside the workspace: ../x.');
    });

    it('rejects a symbolic link resolving outside the root', async () => {
      const outside = mkdtempSync(path.join(tmpdir(), 'file-glob-outside-'));
      try {
        write(outside, 'b.ts');
        symlinkSync(outside, path.join(root, 'out'));
        expect(await glob('* --path out')).toBe('Outside the workspace: out.');
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it('rejects a missing directory', async () => {
      expect(await glob('* --path missing')).toBe('Directory not found: missing.');
    });

    it('rejects a path through a file as not found', async () => {
      expect(await glob('* --path a.ts/x')).toBe('Directory not found: a.ts/x.');
    });

    it('rejects a file', async () => {
      expect(await glob('* --path a.ts')).toBe('Not a directory: a.ts.');
    });

    it('rejects a secret file as not a directory', async () => {
      write(root, '.env');
      expect(await glob('* --path .env')).toBe('Not a directory: .env.');
    });
  });

  describe('--path decisions', () => {
    it('gives (no matches) for a secret directory with and without --hidden', async () => {
      write(root, '.aws/credentials');
      expect(await glob('* --path .aws')).toBe('(no matches)');
      expect(await glob('* --path .aws --hidden')).toBe('(no matches)');
    });

    it('gives (no matches) for an in-root link to a secret directory', async () => {
      write(root, '.aws/credentials');
      symlinkSync('.aws', path.join(root, 'awslink'));
      expect(await glob('* --path awslink')).toBe('(no matches)');
      expect(await glob('* --path awslink --hidden')).toBe('(no matches)');
    });

    it('lists through an in-root link under the link name', async () => {
      write(root, 'real/a.ts');
      symlinkSync('real', path.join(root, 'linked'));
      expect(await glob('* --path linked')).toBe('linked/a.ts');
    });

    it('omits secret matches by their real location under an in-root link to a secret path prefix', async () => {
      for (const file of ['.config/gh/hosts.yml', '.config/gcloud/x', '.config/ok.txt']) write(root, file);
      symlinkSync('.config', path.join(root, 'cfg'));
      expect(await glob('** --path cfg')).toBe('cfg/ok.txt');
      expect(await glob('** --path cfg --hidden')).toBe('cfg/ok.txt');
    });

    it('does not count a secret match under an in-root link toward the limit', async () => {
      for (const file of ['.claude/.credentials.json', '.claude/settings.json']) write(root, file);
      symlinkSync('.claude', path.join(root, 'c'));
      expect(await glob('** --path c --hidden --limit 1')).toBe('c/settings.json');
    });

    it('lists a dot-directory named as --path without --hidden', async () => {
      write(root, '.github/workflows/ci.yml');
      expect(await glob('**/* --path .github')).toBe('.github/workflows/ci.yml');
    });
  });

  describe('--dirs', () => {
    it('lists directories with a trailing slash, empty ones included, excluding --path itself', async () => {
      write(root, 'src/a.ts');
      write(root, 'src/x/b.ts');
      mkdirSync(path.join(root, 'src/empty'));
      expect(await glob('** --dirs --path src')).toBe('src/empty/\nsrc/x/');
    });
  });

  describe('timeout', () => {
    it('prints (no matches) and the timeout line for a deadline already passed', async () => {
      write(root, 'a');
      expect(await glob('**/*', 0)).toBe(`(no matches)\n${TIMEOUT_LINE}`);
    });

    it('keeps matches found before the deadline', async () => {
      write(root, 'a');
      write(root, 'b/x');
      const parsed = parseFileGlob('file glob **/* --hidden');
      if ('error' in parsed) throw new Error(parsed.error);
      vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(2);
      expect(await globWorkspace(root, parsed, 1)).toBe(`a\n${TIMEOUT_LINE}`);
    });
  });

  describe('cancellation', () => {
    beforeEach(() => {
      write(root, 'a.ts');
      write(root, 'src/b.ts');
    });

    it('stops the walk without a timeout line when the signal is already aborted', async () => {
      const parsed = parseFileGlob('file glob ** --hidden');
      if ('error' in parsed) throw new Error(parsed.error);
      expect(await globWorkspace(root, parsed, Date.now() + 60_000)).toBe('a.ts\nsrc/b.ts');
      expect(await globWorkspace(root, parsed, Date.now() + 60_000, AbortSignal.abort())).toBe('(no matches)');
    });

    it('passes the signal from globWorkspaceCommand to the walk', async () => {
      expect(await globWorkspaceCommand(root, 'file glob ** --hidden')).toBe('a.ts\nsrc/b.ts');
      expect(await globWorkspaceCommand(root, 'file glob ** --hidden', AbortSignal.abort())).toBe('(no matches)');
    });
  });

  describe('globWorkspaceCommand', () => {
    it('returns the usage line for malformed input', async () => {
      expect(await globWorkspaceCommand(root, 'file glob')).toBe(FILE_GLOB_USAGE);
    });

    it('returns the result for valid input', async () => {
      write(root, 'src/a.ts');
      expect(await globWorkspaceCommand(root, 'file glob *.ts --path src')).toBe('src/a.ts');
    });
  });
});
