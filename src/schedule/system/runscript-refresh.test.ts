import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../../managers.js';
import type { Tab } from '../../tab/types.js';
import type { SystemScheduleEntry } from './types.js';
import { makeTab } from '../../tab/index.js';
import { messageBus } from '../../bus.js';
import * as files from './runscript-files.js';
import { runscriptFilePath } from './runscript-files.js';
import { createRunscriptRefresh, subscribeRunscriptRefresh } from './runscript-refresh.js';

const listens = (pluginId: string) => pluginId === 'scripts';

function withProject(run: (root: string) => void): void {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'runscript refresh ')));
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

function pluginTab(id: string): Tab {
  return {
    ...makeTab('scripts', '#aaa'),
    view: 'plugin',
    plugin: { id, instanceKey: 'scripts', schemaVersion: 1, payload: {}, fileRefs: [], sourceLabel: 'scripts' },
  };
}

function editorTab(file: string): Tab {
  return { ...makeTab('deploy', '#aaa'), view: 'editor', editor: { name: 'deploy.rs', path: file, size: '0', url: '/open/deploy' } };
}

function scheduled(script: string): SystemScheduleEntry {
  return { id: `${script}-id`, key: `${script}-key`, command: `script ${script}`, script, spec: 'at 9am', nextRun: Date.now() + 60_000, recurring: false };
}

function fakeManagers(root: string, tabs: Tab[], entries: SystemScheduleEntry[] = []): Managers {
  return {
    tab: { tabs, launchDir: root },
    systemSchedule: { list: vi.fn(() => entries.map((entry) => ({ ...entry }))) },
  } as unknown as Managers;
}

describe('runscript refresh gating', () => {
  it('reads nothing and publishes nothing while no admitted tab is open', () => {
    withProject((root) => {
      writeFileSync(path.join(scriptsDir(root), 'deploy.rs'), '');
      const listed = vi.spyOn(files, 'listRunscriptNames');
      const publish = vi.fn();
      const managers = fakeManagers(root, [makeTab('janus', '#aaa')]);
      try {
        createRunscriptRefresh(managers, listens, publish).tick();
        expect(listed).not.toHaveBeenCalled();
        expect(managers.systemSchedule.list).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
      } finally {
        listed.mockRestore();
      }
    });
  });

  it('does not admit an open tab whose plugin the host does not listen for, even when runscripts exist', () => {
    withProject((root) => {
      writeFileSync(path.join(scriptsDir(root), 'deploy.rs'), '');
      const listed = vi.spyOn(files, 'listRunscriptNames');
      const publish = vi.fn();
      try {
        createRunscriptRefresh(fakeManagers(root, [pluginTab('notes')]), listens, publish).tick();
        expect(listed).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
      } finally {
        listed.mockRestore();
      }
    });
  });

  it('publishes nothing and clears the stored rows once the last admitted tab closes, then publishes the set again on reopen', () => {
    withProject((root) => {
      writeFileSync(path.join(scriptsDir(root), 'deploy.rs'), '');
      const tabs = [pluginTab('scripts')];
      const publish = vi.fn();
      const refresh = createRunscriptRefresh(fakeManagers(root, tabs), listens, publish);
      refresh.tick();
      expect(publish).toHaveBeenCalledTimes(1);

      tabs.length = 0;
      refresh.tick();
      expect(publish).toHaveBeenCalledTimes(1);

      tabs.push(pluginTab('scripts'));
      refresh.tick();
      expect(publish).toHaveBeenCalledTimes(2);
    });
  });
});

describe('runscript refresh changes', () => {
  it('publishes on the first admitted tick when a runscript exists', () => {
    withProject((root) => {
      writeFileSync(path.join(scriptsDir(root), 'deploy.rs'), '');
      const publish = vi.fn();
      createRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')]), listens, publish).tick();
      expect(publish).toHaveBeenCalledTimes(1);
    });
  });

  it('ensures Git exclusions on refresh and still publishes the runscript', () => {
    withProject((root) => {
      execFileSync('git', ['init', '-q'], { cwd: root });
      writeFileSync(path.join(scriptsDir(root), 'deploy.rs'), '');
      const excludeFile = path.join(root, '.git', 'info', 'exclude');
      const before = readFileSync(excludeFile, 'utf8');
      expect(before).not.toContain('/.janissary/scripts');
      const publish = vi.fn();
      const refresh = createRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')]), listens, publish);
      refresh.tick();
      const afterFirstTick = readFileSync(excludeFile, 'utf8');
      expect(afterFirstTick).toContain('/.janissary/system-schedules.json');
      expect(afterFirstTick).toContain('/.janissary/scripts');
      refresh.tick();
      expect(readFileSync(excludeFile, 'utf8')).toBe(afterFirstTick);
      expect(publish).toHaveBeenCalledTimes(1);
    });
  });

  it('publishes nothing on an admitted tick when no runscript exists', () => {
    withProject((root) => {
      const publish = vi.fn();
      const refresh = createRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')]), listens, publish);
      refresh.tick();
      refresh.tick();
      expect(publish).not.toHaveBeenCalled();
    });
  });

  it('publishes a new file once, then nothing while the set stays the same', () => {
    withProject((root) => {
      const dir = scriptsDir(root);
      const publish = vi.fn();
      const refresh = createRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')]), listens, publish);
      refresh.tick();
      writeFileSync(path.join(dir, 'deploy.rs'), '');
      refresh.tick();
      refresh.tick();
      expect(publish).toHaveBeenCalledTimes(1);
    });
  });

  it('publishes when a runscript is removed', () => {
    withProject((root) => {
      const file = path.join(scriptsDir(root), 'deploy.rs');
      writeFileSync(file, '');
      const publish = vi.fn();
      const refresh = createRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')]), listens, publish);
      refresh.tick();
      unlinkSync(file);
      refresh.tick();
      expect(publish).toHaveBeenCalledTimes(2);
    });
  });

  it('publishes when a row system schedule count changes', () => {
    withProject((root) => {
      writeFileSync(path.join(scriptsDir(root), 'deploy.rs'), '');
      const entries: SystemScheduleEntry[] = [];
      const publish = vi.fn();
      const refresh = createRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')], entries), listens, publish);
      refresh.tick();
      entries.push(scheduled('deploy'));
      refresh.tick();
      refresh.tick();
      expect(publish).toHaveBeenCalledTimes(2);
    });
  });

  it('publishes when a row open flag changes', () => {
    withProject((root) => {
      scriptsDir(root);
      const file = runscriptFilePath(root, 'deploy');
      writeFileSync(file, '');
      const tabs = [pluginTab('scripts')];
      const publish = vi.fn();
      const refresh = createRunscriptRefresh(fakeManagers(root, tabs), listens, publish);
      refresh.tick();
      tabs.push(editorTab(file));
      refresh.tick();
      expect(publish).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps a symlinked state directory to an empty list and reports the exclusion refusal', () => {
    withProject((root) => {
      const elsewhere = path.join(root, 'elsewhere');
      mkdirSync(elsewhere);
      symlinkSync(elsewhere, path.join(root, '.janissary'));
      const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const publish = vi.fn();
      try {
        const refresh = createRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')]), listens, publish);
        expect(() => refresh.tick()).not.toThrow();
        expect(publish).not.toHaveBeenCalled();
        expect(write).toHaveBeenCalledWith(expect.stringContaining('could not be excluded from Git'));
      } finally {
        write.mockRestore();
      }
    });
  });

  it('publishes nothing on a tick after dispose', () => {
    withProject((root) => {
      const dir = scriptsDir(root);
      writeFileSync(path.join(dir, 'deploy.rs'), '');
      const publish = vi.fn();
      const refresh = createRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')]), listens, publish);
      refresh.tick();
      expect(publish).toHaveBeenCalledTimes(1);
      refresh.dispose();
      writeFileSync(path.join(dir, 'build.rs'), '');
      const listed = vi.spyOn(files, 'listRunscriptNames');
      try {
        refresh.tick();
        expect(publish).toHaveBeenCalledTimes(1);
        expect(listed).not.toHaveBeenCalled();
      } finally {
        listed.mockRestore();
      }
    });
  });
});

describe('subscribeRunscriptRefresh', () => {
  it('runs a refresh tick on each schedules tick event until unsubscribed', () => {
    withProject((root) => {
      const dir = scriptsDir(root);
      writeFileSync(path.join(dir, 'deploy.rs'), '');
      const changed = vi.fn();
      const listener = messageBus.on('runscripts', 'changed', changed);
      const subscription = subscribeRunscriptRefresh(fakeManagers(root, [pluginTab('scripts')]), listens);
      try {
        messageBus.emit('schedules', { type: 'tick' });
        expect(changed).toHaveBeenCalledTimes(1);

        subscription.unsubscribe();
        writeFileSync(path.join(dir, 'build.rs'), '');
        const listed = vi.spyOn(files, 'listRunscriptNames');
        try {
          messageBus.emit('schedules', { type: 'tick' });
          expect(listed).not.toHaveBeenCalled();
          expect(changed).toHaveBeenCalledTimes(1);
        } finally {
          listed.mockRestore();
        }
      } finally {
        subscription.unsubscribe();
        listener.unsubscribe();
      }
    });
  });
});
