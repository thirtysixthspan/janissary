import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSnapshot } from '../agent/types.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import { initWorkspaceDir } from '../workspace/index.js';
import { RemoteRunClones } from './serve-run-clones.js';
import { resolveRemoteAgentRequest } from './serve-agent-resolution.js';
import type { ServerFrame } from './protocol-frames.js';

const install = vi.hoisted(() => ({ root: '' }));
vi.mock('../janissary-root.js', () => ({ janissaryRoot: () => install.root }));

let main: string;
let clone: string;
let installRoot: string;
let roots: string[];

function tree(root: string, task: string, skill: string): void {
  mkdirSync(path.join(root, 'ai', 'tasks'), { recursive: true });
  mkdirSync(path.join(root, 'skills', 'review'), { recursive: true });
  writeFileSync(path.join(root, 'ai', 'tasks', 'shared-task.md'), `shared from ${task}`);
  writeFileSync(path.join(root, 'ai', 'tasks', 'installed-task.md'), `installed from ${task}`);
  writeFileSync(path.join(root, 'skills', 'review', 'SKILL.md'), `skill from ${skill}`);
  writeFileSync(path.join(root, 'skills', 'review', 'janissary.json'), '{"version":1,"commands":["db"]}');
}

function resolve(workspace: string, task: string, skills: string[] = [], lookup?: RemoteRunClones['lookup']): AgentSnapshot {
  const frames: ServerFrame[] = [];
  resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-1', task, skills }, workspace, (frame) => { frames.push(frame); }, lookup);
  const frame = frames[0];
  if (frame?.type !== 'agent-resolve-result' || !frame.snapshot) {
    throw new Error(frame?.type === 'agent-resolve-result' ? frame.error : 'no result frame');
  }
  return frame.snapshot;
}

async function cloneLookup(state: 'pending' | 'releasing' | 'released' | 'stopping'): Promise<RemoteRunClones['lookup']> {
  const tracked = new Set<string>();
  const handles: PromiseWithResolvers<void>[] = [];
  const manager = {
    create: vi.fn((label: string) => {
      const settle = Promise.withResolvers<void>();
      handles.push(settle);
      const dir = path.join(main, label);
      tracked.add(dir);
      return { dir, ready: settle.promise, cancel: vi.fn() };
    }),
    tracks: vi.fn((dir: string) => tracked.has(dir)),
    remove: vi.fn((dir: string) => { tracked.delete(dir); }),
    cancel: vi.fn(),
  } as unknown as WorkspaceManager;
  const service = new RemoteRunClones(manager, {}, 'main');
  if (state === 'stopping') {
    service.stop();
    return (label) => service.lookup(label);
  }
  const created = service.create('the-clone');
  await vi.waitFor(() => expect(handles).toHaveLength(1));
  if (state === 'pending') return (label) => service.lookup(label);
  handles[0]!.resolve();
  await created;
  if (state === 'releasing') void service.release('the-clone');
  else if (state === 'released') await service.release('the-clone');
  return (label) => service.lookup(label);
}

beforeEach(() => {
  roots = [mkdtempSync(path.join(tmpdir(), 'resolution-main-')), mkdtempSync(path.join(tmpdir(), 'resolution-clone-')), mkdtempSync(path.join(tmpdir(), 'resolution-install-'))]
    .map((dir) => realpathSync(dir));
  [main, clone, installRoot] = roots;
  tree(main, 'main', 'main');
  tree(clone, 'clone', 'clone');
  tree(installRoot, 'install', 'install');
  install.root = installRoot;
  initWorkspaceDir(main, path.join(main, '.claude.json'));
});

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('resolveRemoteAgentRequest', () => {
  it('resolves task content on the execution host', () => {
    const frames: ServerFrame[] = [];
    resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-2', task: 'ai/tasks/feature/work-pull-request-issue.md', skills: [] },
      process.cwd(), (frame) => { frames.push(frame); });

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      type: 'agent-resolve-result', id: 'run-2',
      snapshot: { taskText: expect.stringContaining('# Work a Pull Request Issue'), grants: [], skills: [] },
    });
  });

  it('returns task-resolution errors to the request instead of faulting the channel', () => {
    const emit = vi.fn();
    resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-3', task: 'missing-task.md', skills: [] },
      process.cwd(), emit);

    expect(emit).toHaveBeenCalledWith({
      type: 'agent-resolve-result', id: 'run-3', error: 'Agent: unknown task "missing-task.md".',
    });
  });

  it('prefers a clone task by basename over the main task', () => {
    const snapshot = resolve(clone, 'shared-task.md');

    expect(snapshot.taskText).toBe('shared from clone');
    expect(snapshot.taskPath).toBe(path.join(clone, 'ai', 'tasks', 'shared-task.md'));
    expect(resolve(main, 'shared-task.md').taskText).toBe('shared from main');
    expect(resolve(clone, 'shared-task.md', [], (label) => label === 'the-clone' ? clone : undefined).taskText).toBe('shared from clone');
  });

  it('falls back to the installed task when only the main has a competing copy', () => {
    expect(resolve(main, 'installed-task.md').taskText).toBe('installed from main');
    rmSync(path.join(clone, 'ai', 'tasks', 'installed-task.md'));

    const snapshot = resolve(clone, 'installed-task.md', [], (label) => label === 'the-clone' ? clone : undefined);

    expect(snapshot.taskText).toBe('installed from install');
  });

  it('resolves an explicit clone-relative task in the selected clone', () => {
    const snapshot = resolve(clone, 'ai/tasks/shared-task.md', [], (label) => label === 'the-clone' ? clone : undefined);

    expect(snapshot.taskText).toBe('shared from clone');
    expect(snapshot.taskPath).toBe(path.join(clone, 'ai', 'tasks', 'shared-task.md'));
  });

  it('resolves an explicit installed task in the installation', () => {
    const snapshot = resolve(clone, '$janissary/ai/tasks/installed-task.md', [], (label) => label === 'the-clone' ? clone : undefined);

    expect(snapshot.taskText).toBe('installed from install');
  });

  it('takes skill content and grants from the selected clone', () => {
    const snapshot = resolve(clone, 'shared-task.md', ['review'], (label) => label === 'the-clone' ? clone : undefined);

    expect(snapshot.skills).toEqual([expect.objectContaining({
      source: 'project', name: 'review', instructions: 'skill from clone',
    })]);
    expect(snapshot.grants).toEqual(['db']);
    expect(resolve(main, 'shared-task.md', ['review']).skills[0]?.instructions).toBe('skill from main');
  });

  it('keeps unknown, ambiguous, traversal and escaping-symlink task errors', () => {
    const lookup = (label: string) => label === 'the-clone' ? clone : undefined;
    const errorFor = (task: string) => {
      const frames: ServerFrame[] = [];
      resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-4', task, skills: [], workspace: 'the-clone' }, main, (frame) => { frames.push(frame); }, lookup);
      const frame = frames[0];
      return frame?.type === 'agent-resolve-result' ? frame.error : undefined;
    };

    expect(errorFor('nope.md')).toBe('Agent: unknown task "nope.md".');
    mkdirSync(path.join(clone, 'ai', 'tasks', 'one'));
    mkdirSync(path.join(clone, 'ai', 'tasks', 'two'));
    writeFileSync(path.join(clone, 'ai', 'tasks', 'one', 'dup.md'), 'one');
    writeFileSync(path.join(clone, 'ai', 'tasks', 'two', 'dup.md'), 'two');
    expect(errorFor('dup.md')).toBe('Agent: ambiguous task "dup.md": one/dup.md, two/dup.md.');
    writeFileSync(path.join(main, 'escape.md'), 'outside');
    const traversal = `../${path.basename(main)}/escape.md`;
    expect(errorFor(traversal)).toBe(`Agent: task path outside allowed roots "${traversal}".`);
    writeFileSync(path.join(main, 'outside.md'), 'outside');
    symlinkSync(path.join(main, 'outside.md'), path.join(clone, 'ai', 'tasks', 'escape.md'));
    expect(errorFor('ai/tasks/escape.md')).toBe('Agent: task path outside allowed roots "ai/tasks/escape.md".');
  });

  it('refuses an unknown or path-shaped selector before resolving anything', () => {
    const emit = vi.fn();
    const lookup = (label: string) => label === 'the-clone' ? clone : undefined;
    for (const workspace of ['nope', '../escape']) {
      resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-5', task: 'missing-task.md', skills: [], workspace }, main, emit, lookup);
    }

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, {
      type: 'agent-resolve-result', id: 'run-5', error: 'Unknown remote run clone "nope".',
    });
    expect(emit).toHaveBeenNthCalledWith(2, {
      type: 'agent-resolve-result', id: 'run-5', error: 'Unknown remote run clone "../escape".',
    });
  });

  it('refuses a selector when no lookup callback was injected', () => {
    const emit = vi.fn();
    resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-6', task: 'shared-task.md', skills: [], workspace: 'the-clone' }, main, emit);

    expect(emit).toHaveBeenCalledExactlyOnceWith({
      type: 'agent-resolve-result', id: 'run-6', error: 'Unknown remote run clone "the-clone".',
    });
  });

  it.each(['pending', 'releasing', 'released', 'stopping'] as const)(
    'refuses a %s clone through the real lookup contract', async (state) => {
      const lookup = await cloneLookup(state);
      const emit = vi.fn();

      resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-7', task: 'missing-task.md', skills: [], workspace: 'the-clone' }, main, emit, lookup);

      expect(emit).toHaveBeenCalledExactlyOnceWith({
        type: 'agent-resolve-result', id: 'run-7', error: 'Unknown remote run clone "the-clone".',
      });
    },
  );
});
