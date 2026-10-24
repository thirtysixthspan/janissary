import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, it, expect } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { initWorkspaceDir } from '../workspace/index.js';
import type { FileSystemPort } from '../file-navigator/filesystem-port.js';
import {
  clearRemoteFileCache, forgetRemoteFilesOf, initRemoteFileCache, materializeRemoteFile,
} from '../file-navigator/remote/file-cache.js';
import { agentMonitorManifest } from './agent-monitor/manifest.js';
import { originWorkspace } from './origin-workspace.js';

type Entry = { dir?: string; label?: string };

function managersWith(entries: Record<string, Entry>, provisioning: (dir: string) => boolean = () => false): Managers {
  const known = new Map(Object.entries(entries));
  return {
    remote: {
      get: (label: string) => (known.has(label) ? {} : undefined),
      workspaceOf: (label: string) => known.get(label)?.dir,
      workspaceLabelOf: (label: string) => known.get(label)?.label,
    },
    workspace: { provisioning },
  } as unknown as Managers;
}

const tab = (fields: Partial<Tab>): Tab => ({ label: 'tab', ...fields }) as Tab;
const remote = { address: 'devbox:/srv/project', host: 'devbox' };

describe('originWorkspace', () => {
  it('answers a local harness clone with its label and display form', () => {
    const dir = '/repo/.janissary/workspace/demir';
    expect(originWorkspace(managersWith({}), tab({ view: 'harness', workspaceDir: dir }))).toEqual({
      workspace: { dir, offline: false, label: 'demir', display: '$workspace/demir' },
      provisioning: false,
    });
  });

  it('answers a local shell plugin clone with its label and display form', () => {
    const dir = '/repo/.janissary/workspace/demir';
    expect(originWorkspace(managersWith({}), tab({
      view: 'plugin', plugin: { id: 'shell' } as Tab['plugin'], workspaceDir: dir,
    }))).toEqual({
      workspace: { dir, offline: false, label: 'demir', display: '$workspace/demir' },
      provisioning: false,
    });
  });

  it('answers a remote harness from its channel, riding itself on its host', () => {
    const managers = managersWith({ h1: { dir: '/srv/work/claude-2', label: 'claude-2' } });
    expect(originWorkspace(managers, tab({ label: 'h1', view: 'harness', remote }))).toEqual({
      workspace: {
        dir: '/srv/work/claude-2', offline: false, label: 'claude-2', display: '$workspace/claude-2',
        ride: 'h1', host: 'devbox',
      },
      provisioning: false,
    });
  });

  it('reports a provisioning clone with its workspace', () => {
    const dir = '/repo/.janissary/workspace/demir';
    const answer = originWorkspace(managersWith({}, (asked) => asked === dir), tab({ workspaceDir: dir }));
    expect(answer.provisioning).toBe(true);
    expect(answer.workspace?.dir).toBe(dir);
  });

  it('reports a remote tab whose far side has not answered as provisioning, named by its entry', () => {
    const managers = managersWith({ h1: { label: 'claude-2' } });
    expect(originWorkspace(managers, tab({ label: 'h1', view: 'harness', remote }))).toEqual({
      provisioning: true, workspaceLabel: 'claude-2',
    });
  });

  it('marks a joined plugin tab whose session ended as gone, keeping the entry facts', () => {
    const managers = managersWith({ s1: { dir: '/srv/work/claude-2', label: 'claude-2' } });
    const answer = originWorkspace(managers, tab({
      label: 's1', view: 'plugin', plugin: { id: 'search' } as Tab['plugin'], remote, sessionTerminated: 'ended',
    }));
    expect(answer).toEqual({
      workspace: { dir: '/srv/work/claude-2', label: 'claude-2', display: '$workspace/claude-2', gone: true, ride: 's1', host: 'devbox' },
      provisioning: false,
    });
  });

  it('marks a joined plugin tab whose entry was released as gone, with no directory', () => {
    const answer = originWorkspace(managersWith({}), tab({
      label: 's1', view: 'plugin', plugin: { id: 'search' } as Tab['plugin'], remote,
    }));
    expect(answer).toEqual({ workspace: { dir: '', label: 's1', display: '', gone: true }, provisioning: false });
  });

  it('answers a joined plugin tab on a live channel with the channel workspace, riding itself', () => {
    const managers = managersWith({ d1: { dir: '/srv/work/claude-2', label: 'claude-2' } });
    const answer = originWorkspace(managers, tab({
      label: 'd1', view: 'plugin', plugin: { id: 'diff' } as Tab['plugin'], remote,
    }));
    expect(answer.workspace).toMatchObject({ dir: '/srv/work/claude-2', label: 'claude-2', ride: 'd1' });
    expect(answer.workspace?.gone).toBeUndefined();
    expect(answer.provisioning).toBe(false);
  });

  it('answers no workspace and no provisioning for an agent tab', () => {
    expect(originWorkspace(managersWith({}), tab({ label: 'agent-1' }))).toEqual({ provisioning: false });
  });
});

type KindFakes = {
  entries?: Record<string, Entry & { host?: string }>;
  runs?: Record<string, { host: string; workspace: string }>;
  live?: { host: string; workspaceDir?: string; labels: string[] }[];
  tracked?: string[];
  open?: string[];
};

function kindManagers(fakes: KindFakes): Managers {
  const managers = managersWith(fakes.entries ?? {}) as unknown as {
    remote: Record<string, unknown>; workspace: Record<string, unknown>;
  } & Record<string, unknown>;
  const entries = fakes.entries ?? {};
  managers.remote.addressOf = (label: string) => {
    const host = entries[label]?.host;
    return host === undefined ? undefined : { host };
  };
  managers.remote.liveEntries = () => (fakes.live ?? []).map((entry) => ({
    address: { host: entry.host }, workspaceDir: entry.workspaceDir, labels: new Set(entry.labels),
  }));
  managers.workspace.tracks = (dir: string) => (fakes.tracked ?? []).includes(dir);
  managers.tab = { byLabel: (label: string) => ((fakes.open ?? []).includes(label) ? {} : undefined) };
  const runs = new Map(Object.entries(fakes.runs ?? {}).map(([id, view]) => [id, { view: () => view }]));
  managers.agent = { runs };
  return managers as unknown as Managers;
}

const ws = '/repo/.janissary/workspace';
const monitor = (agentRunId?: string): Tab => tab({
  label: 'Agent: task', view: 'plugin', plugin: { id: agentMonitorManifest.id, agentRunId } as Tab['plugin'],
});
const editor = (file: string): Tab => tab({
  label: 'notes.txt', view: 'editor', editor: { name: 'notes.txt', path: file, size: '1 B', url: '/f' },
});
const navigator = (files: Partial<NonNullable<Tab['files']>>): Tab => tab({
  label: 'files', view: 'files', files: { root: '', absoluteRoot: '', rows: [], ...files } as Tab['files'],
});
const clone = (name: string) => ({
  workspace: { dir: `${ws}/${name}`, offline: false, label: name, display: `$workspace/${name}` }, provisioning: false,
});
const goneClone = (name: string) => ({
  workspace: { dir: `${ws}/${name}`, label: name, display: `$workspace/${name}`, gone: true }, provisioning: false,
});
const goneNoDir = (label: string) => ({ workspace: { dir: '', label, display: '', gone: true }, provisioning: false });

describe('originWorkspace for monitors, editors, and navigators', () => {
  beforeAll(() => initWorkspaceDir('/repo'));
  afterEach(() => clearRemoteFileCache());

  it('answers an agent monitor on a tracked local clone with the clone', () => {
    const managers = kindManagers({ runs: { r1: { host: 'Local', workspace: `${ws}/demir` } }, tracked: [`${ws}/demir`] });
    expect(originWorkspace(managers, monitor('r1'))).toEqual(clone('demir'));
  });

  it('marks an agent monitor on an untracked local clone as gone', () => {
    const managers = kindManagers({ runs: { r1: { host: 'Local', workspace: `${ws}/demir/src` } } });
    expect(originWorkspace(managers, monitor('r1'))).toEqual(goneClone('demir'));
  });

  it('answers no workspace for a local agent monitor running in the caller cwd', () => {
    const managers = kindManagers({ runs: { r1: { host: 'Local', workspace: '/repo/src' } } });
    expect(originWorkspace(managers, monitor('r1'))).toEqual({ provisioning: false });
  });

  it('rides an open tab on a remote agent monitor workspace, with the run host', () => {
    const managers = kindManagers({
      runs: { r1: { host: 'devbox', workspace: '/srv/work/claude-2' } },
      live: [{ host: 'devbox', workspaceDir: '/srv/work/claude-2', labels: ['closed', 'h1'] }],
      open: ['h1'],
      entries: { h1: { dir: '/srv/work/claude-2', label: 'claude-2' } },
    });
    expect(originWorkspace(managers, monitor('r1')).workspace).toEqual({
      dir: '/srv/work/claude-2', offline: false, label: 'claude-2', display: '$workspace/claude-2', ride: 'h1', host: 'devbox',
    });
  });

  it('marks a remote agent monitor with no riding tab as gone, keeping its directory and host', () => {
    const managers = kindManagers({
      runs: { r1: { host: 'devbox', workspace: '/srv/work/claude-2' } },
      live: [{ host: 'devbox', workspaceDir: '/srv/other', labels: ['h1'] }],
      open: ['h1'],
    });
    expect(originWorkspace(managers, monitor('r1'))).toEqual({
      workspace: { dir: '/srv/work/claude-2', label: 'claude-2', display: '$workspace/claude-2', gone: true, host: 'devbox' },
      provisioning: false,
    });
  });

  it('marks an agent monitor whose run is missing as gone, and keeps an ended bound run', () => {
    expect(originWorkspace(kindManagers({}), monitor('r1'))).toEqual(goneNoDir('Agent: task'));
    expect(originWorkspace(kindManagers({}), monitor())).toEqual(goneNoDir('Agent: task'));
    const ended = kindManagers({ runs: { r1: { host: 'Local', workspace: `${ws}/demir` } }, tracked: [`${ws}/demir`] });
    expect(originWorkspace(ended, monitor('r1')).workspace?.gone).toBeUndefined();
  });

  it('answers a local editor file inside a tracked clone with the clone', () => {
    const managers = kindManagers({ tracked: [`${ws}/demir`] });
    expect(originWorkspace(managers, editor(`${ws}/demir/src/a.ts`))).toEqual(clone('demir'));
  });

  it('marks a local editor file in an untracked clone as gone', () => {
    expect(originWorkspace(kindManagers({}), editor(`${ws}/demir/a.ts`))).toEqual(goneClone('demir'));
  });

  // A clone whose name merely starts with `..` is under the workspaces directory, not above it.
  it('answers a local editor file inside a clone named ..notes with that clone', () => {
    const managers = kindManagers({ tracked: [`${ws}/..notes`] });
    expect(originWorkspace(managers, editor(`${ws}/..notes/a.md`))).toEqual(clone('..notes'));
  });

  it('rides the materializing tab for a remote-cache editor file', () => {
    const file = cachedFile('files');
    const managers = kindManagers({ entries: { files: { dir: '/remote/ws', label: 'claude', host: 'devbox' } } });
    expect(originWorkspace(managers, editor(file)).workspace).toMatchObject({ dir: '/remote/ws', ride: 'files', host: 'devbox' });
  });

  it('marks a remote-cache editor file whose materializing channel is gone as gone', () => {
    const file = cachedFile('files');
    expect(originWorkspace(kindManagers({}), editor(file))).toEqual(goneNoDir('ws'));
  });

  it('marks an orphaned remote-cache editor file as gone with the editor label', () => {
    const file = cachedFile('files');
    forgetRemoteFilesOf(cacheFilesystem);
    expect(originWorkspace(kindManagers({}), editor(file))).toEqual(goneNoDir('notes.txt'));
  });

  it('answers a local navigator by its absolute root, tracked or gone', () => {
    const tracked = kindManagers({ tracked: [`${ws}/demir`] });
    expect(originWorkspace(tracked, navigator({ root: '$workspace/demir', absoluteRoot: `${ws}/demir` }))).toEqual(clone('demir'));
    expect(originWorkspace(kindManagers({}), navigator({ absoluteRoot: `${ws}/demir` }))).toEqual(goneClone('demir'));
  });

  it('rides a remote navigator itself, and marks it gone once its channel ends', () => {
    const files = { remote: { address: 'devbox:/srv/project', host: 'devbox' } };
    const managers = kindManagers({ entries: { files: { dir: '/srv/project', label: 'project' } } });
    expect(originWorkspace(managers, navigator(files)).workspace).toMatchObject({ dir: '/srv/project', ride: 'files', host: 'devbox' });
    expect(originWorkspace(kindManagers({}), navigator(files))).toEqual(goneNoDir('files'));
  });

  it('answers no workspace for an editor file and a navigator root outside every clone', () => {
    expect(originWorkspace(kindManagers({}), editor('/repo/src/a.ts'))).toEqual({ provisioning: false });
    expect(originWorkspace(kindManagers({}), navigator({ absoluteRoot: '/repo' }))).toEqual({ provisioning: false });
  });
});

const cacheFilesystem = {} as FileSystemPort;

function cachedFile(label: string): string {
  initRemoteFileCache(mkdtempSync(path.join(tmpdir(), 'janus-origin-cache-')));
  return materializeRemoteFile(
    { destination: 'devbox', workspaceRoot: '/remote/ws', workspaceLabel: 'claude' },
    'notes.txt', Buffer.from('x'),
    { filesystem: cacheFilesystem, root: '/remote/ws', relPath: 'notes.txt', label },
  );
}
