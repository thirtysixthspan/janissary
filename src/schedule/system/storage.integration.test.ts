import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as Fs from 'node:fs';
import { clearStateDirectories } from '../../state/dirs.js';
import { initHarnessCaptureDirectory } from '../../harness/capture/file.js';
import { SystemScheduleStore } from './store.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

const snapshot = {
  version: 1 as const,
  entries: [{ key: 'opaque-1', id: 'daily', command: 'script deploy', spec: 'every 1d deploy', nextRun: 1_800_000_000_000, recurring: true, intervalMs: 86_400_000, script: 'deploy' }],
};

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

describe('system schedule storage integration', () => {
  it('round-trips complete snapshots and blocks malformed and future-version stores appropriately', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system schedule store '));
    try {
      const store = new SystemScheduleStore(root);
      expect(store.load()).toEqual({ ok: true, snapshot: { version: 1, entries: [] } });
      expect(store.save(snapshot)).toEqual({ ok: true });
      expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot });
      writeFileSync(store.file, '{broken');
      expect(store.load().ok).toBe(false);
      expect(readFileSync(store.file, 'utf8')).toBe('{broken');
      expect(store.save(snapshot).ok).toBe(true);
      expect(readFileSync(store.file, 'utf8')).not.toBe('{broken');
      writeFileSync(store.file, '{"version":2,"entries":[]}');
      expect(store.load()).toEqual({ ok: false, kind: 'unsupported-version', version: 2 });
      expect(store.save(snapshot)).toEqual({ ok: false, kind: 'unsupported-version', version: 2 });
      expect(new SystemScheduleStore(root).save(snapshot)).toEqual({ ok: false, kind: 'unsupported-version', version: 2 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves the previous snapshot and cleans up after a temporary write failure', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule failed replacement '));
    const directory = path.join(root, '.janissary');
    try {
      const store = new SystemScheduleStore(root);
      expect(store.save(snapshot)).toEqual({ ok: true });
      const previousBytes = readFileSync(store.file, 'utf8');
      vi.mocked(renameSync).mockClear();
      vi.mocked(renameSync).mockImplementationOnce(() => {
        throw Object.assign(new Error('forced replacement failure'), { code: 'EIO' });
      });

      try {
        const replacement = {
          ...snapshot,
          entries: snapshot.entries.map((entry) => ({ ...entry, nextRun: entry.nextRun + 1 })),
        };
        const result = store.save(replacement);

        expect(renameSync).toHaveBeenCalledOnce();
        expect(result).toMatchObject({ ok: false, kind: 'io' });
        expect(readFileSync(store.file, 'utf8')).toBe(previousBytes);
        expect(readdirSync(directory)).toEqual(['system-schedules.json']);
      } finally {
        vi.mocked(renameSync).mockClear();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('adds local excludes in a nested scratch worktree with a space-safe Git invocation', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule git project '));
    try {
      git(root, 'init', '-q');
      const project = path.join(root, 'nested project');
      mkdirSync(project);
      writeFileSync(path.join(root, '.gitignore'), 'user-rule\n');
      const excludeFile = path.join(root, '.git', 'info', 'exclude');
      const originalExclude = `${readFileSync(excludeFile, 'utf8')}# preserve this rule\n`;
      writeFileSync(excludeFile, originalExclude);
      const store = new SystemScheduleStore(project);
      expect(store.save(snapshot)).toEqual({ ok: true });
      expect(git(root, 'check-ignore', '--quiet', '--', 'nested project/.janissary/system-schedules.json')).toBe('');
      expect(git(root, 'check-ignore', '--quiet', '--', 'nested project/.janissary/scripts/')).toBe('');
      expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('user-rule\n');
      expect(readFileSync(excludeFile, 'utf8').startsWith(originalExclude)).toBe(true);
      mkdirSync(path.join(project, '.janissary', 'scripts'));
      writeFileSync(path.join(project, '.janissary', 'scripts', 'deploy.rs'), 'echo hi');
      expect(git(root, 'status', '--short')).toBe('?? .gitignore');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses tracked schedule targets before changing the exclude file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule tracked project '));
    try {
      git(root, 'init', '-q');
      mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
      writeFileSync(path.join(root, '.janissary', 'scripts', 'tracked.rs'), 'echo tracked');
      git(root, 'add', '.janissary/scripts/tracked.rs');
      git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'tracked');
      const store = new SystemScheduleStore(root);
      expect(store.save(snapshot).ok).toBe(false);
      expect(readFileSync(path.join(root, '.janissary', 'scripts', 'tracked.rs'), 'utf8')).toBe('echo tracked');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('honors effective ignore rules without creating a redundant local rule', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule preignored project '));
    try {
      git(root, 'init', '-q');
      writeFileSync(path.join(root, '.gitignore'), '.janissary/\n');
      const originalExclude = readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
      const store = new SystemScheduleStore(root);
      expect(store.save(snapshot)).toEqual({ ok: true });
      expect(git(root, 'check-ignore', '--quiet', '--', '.janissary/system-schedules.json')).toBe('');
      expect(readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8')).toBe(originalExclude);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects symlinked persistent storage paths before reading or replacing them', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule unsafe project '));
    const target = path.join(root, 'real.json');
    try {
      mkdirSync(path.join(root, '.janissary'));
      writeFileSync(target, '{"version":1,"entries":[]}');
      symlinkSync(target, path.join(root, '.janissary', 'system-schedules.json'));
      const result = new SystemScheduleStore(root).load();
      expect(result.ok).toBe(false);
      expect(readFileSync(target, 'utf8')).toBe('{"version":1,"entries":[]}');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps snapshots and scripts through repeated real startup cleanup cycles', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'schedule clear retention '));
    try {
      const store = new SystemScheduleStore(root);
      expect(store.save(snapshot)).toEqual({ ok: true });
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(scripts, 'deploy.rs'), 'echo one');
      for (let cycle = 0; cycle < 2; cycle += 1) {
        initHarnessCaptureDirectory(root);
        const perRun = path.join(root, '.janissary', 'captures');
        mkdirSync(perRun, { recursive: true });
        writeFileSync(path.join(perRun, 'sentinel'), 'remove');
        clearStateDirectories();
        expect(readFileSync(store.file, 'utf8')).toContain('script deploy');
        expect(readFileSync(path.join(scripts, 'deploy.rs'), 'utf8')).toBe(cycle === 0 ? 'echo one' : 'echo two');
        expect(() => readFileSync(path.join(perRun, 'sentinel'), 'utf8')).toThrow();
        expect(new SystemScheduleStore(root).load().ok).toBe(true);
        writeFileSync(path.join(scripts, 'deploy.rs'), 'echo two');
        expect(readFileSync(path.join(scripts, 'deploy.rs'), 'utf8')).toBe('echo two');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
