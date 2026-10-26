import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../../managers.js';
import type { Tab } from '../../tab/types.js';
import type { SystemScheduleEntry } from './types.js';
import { makeTab } from '../../tab/index.js';
import { buildRunscriptRows, readRunscriptRows } from './runscript-rows.js';
import { runscriptFilePath } from './runscript-files.js';

function withProject(run: (root: string) => void): void {
  const root = mkdtempSync(path.join(tmpdir(), 'runscript rows '));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function scriptsDir(root: string): string {
  const dir = path.join(root, '.janissary', 'scripts');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function editorTab(file: string): Tab {
  return { ...makeTab('deploy', '#aaa'), view: 'editor', editor: { name: 'deploy.rs', path: file, size: '0', url: '/open/deploy' } };
}

function scheduled(key: string, script: string): SystemScheduleEntry {
  return { id: key, key, command: `script ${script}`, script, spec: 'at 9am', nextRun: Date.now() + 60_000, recurring: false };
}

function fakeManagers(root: string, tabs: Tab[] = [], entries: SystemScheduleEntry[] = []): Managers {
  return {
    tab: { tabs, launchDir: root },
    systemSchedule: { list: () => entries.map((entry) => ({ ...entry })) },
  } as unknown as Managers;
}

describe('runscript rows', () => {
  it('lists rows sorted by name', () => {
    withProject((root) => {
      const dir = scriptsDir(root);
      writeFileSync(path.join(dir, 'zeta.rs'), '');
      writeFileSync(path.join(dir, 'alpha.rs'), '');

      expect(readRunscriptRows(fakeManagers(root)).rows.map((row) => row.name)).toEqual(['alpha', 'zeta']);
    });
  });

  it('keeps the order it is given in the pure builder', () => {
    expect(buildRunscriptRows(['zeta', 'alpha'], () => 0, () => false).map((row) => row.name)).toEqual(['zeta', 'alpha']);
  });

  it('counts only system schedules whose script is the row name', () => {
    withProject((root) => {
      const dir = scriptsDir(root);
      writeFileSync(path.join(dir, 'alpha.rs'), '');
      writeFileSync(path.join(dir, 'zeta.rs'), '');
      const entries = [scheduled('one', 'alpha'), scheduled('two', 'alpha'), scheduled('three', 'alpha-2')];

      expect(readRunscriptRows(fakeManagers(root, [], entries)).rows).toEqual([
        { name: 'alpha', schedules: 2, open: false },
        { name: 'zeta', schedules: 0, open: false },
      ]);
    });
  });

  it('marks a row open only when an editor tab holds its absolute runscript path', () => {
    withProject((root) => {
      const dir = scriptsDir(root);
      writeFileSync(path.join(dir, 'alpha.rs'), '');
      writeFileSync(path.join(dir, 'zeta.rs'), '');
      const tabs = [editorTab(runscriptFilePath(root, 'alpha')), editorTab(path.join(root, 'elsewhere', 'zeta.rs'))];

      expect(readRunscriptRows(fakeManagers(root, tabs)).rows).toEqual([
        { name: 'alpha', schedules: 0, open: true },
        { name: 'zeta', schedules: 0, open: false },
      ]);
    });
  });

  it('returns an empty view and reports the exclusion failure when the state directory is unsafe', () => {
    withProject((root) => {
      const elsewhere = path.join(root, 'elsewhere');
      mkdirSync(elsewhere);
      symlinkSync(elsewhere, path.join(root, '.janissary'));
      const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        expect(readRunscriptRows(fakeManagers(root))).toEqual({ rows: [] });
        expect(write).toHaveBeenCalledWith(expect.stringContaining('could not be excluded from Git'));
      } finally {
        write.mockRestore();
      }
    });
  });
});
