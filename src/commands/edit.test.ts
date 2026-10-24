import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from './edit.js';
import { TabManager } from '../tab/manager.js';

describe('edit command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('edit');
  });

  it('matches edit commands case-insensitively', () => {
    expect(command.match('edit foo.txt')).toBe(true);
    expect(command.match('EDIT bar.md')).toBe(true);
  });

  it('does not match non-edit input', () => {
    expect(command.match('edited')).toBe(false);
    expect(command.match('open foo.txt')).toBe(false);
  });
});

describe('edit runscript fallback', () => {
  it('opens an existing exact target before a same-named runscript', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'edit-runscript-'));
    try {
      mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
      writeFileSync(path.join(root, 'deploy'), 'project file');
      writeFileSync(path.join(root, '.janissary', 'scripts', 'deploy.rs'), 'echo script');
      const targets: string[] = [];
      const managers = editManagers(root, targets);

      command.run('edit deploy', { label: 'janus', index: 0 }, managers as never);

      expect(targets).toEqual(['deploy']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('opens an existing runscript by its project-root path', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'edit-runscript-'));
    try {
      mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
      const runscript = path.join(root, '.janissary', 'scripts', 'deploy.rs');
      writeFileSync(runscript, 'echo script');
      const targets: string[] = [];

      command.run('edit deploy', { label: 'janus', index: 0 }, editManagers(root, targets) as never);

      expect(targets).toEqual([runscript]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // A tab whose shell has reported no cwd yet, in a server whose project directory is not the
  // process's own: the exact file lives in the project, so it opens instead of falling through to the
  // runscript lookup the way a resolution against `process.cwd()` would.
  it('resolves a tab with no recorded cwd against the project directory, not the process directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'edit-runscript-'));
    try {
      writeFileSync(path.join(root, 'deploy'), 'project file');
      const targets: string[] = [];
      const appended: { input: string; output: string }[] = [];
      const managers = editManagers(root, targets, appended) as { tab: Record<string, unknown> };
      managers.tab.cwdOf = () => {};
      managers.tab.workingDirOf = TabManager.prototype.workingDirOf;
      expect(process.cwd()).not.toBe(root);

      command.run('edit deploy', { label: 'janus', index: 0 }, managers as never);

      expect(targets).toEqual(['deploy']);
      expect(appended.some((entry) => entry.output.startsWith('No runscript'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a missing runscript without calling the editor', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'edit-runscript-'));
    try {
      const targets: string[] = [];
      const appended: { input: string; output: string }[] = [];
      const managers = editManagers(root, targets, appended);

      command.run('edit deploy', { label: 'janus', index: 0 }, managers as never);

      expect(targets).toEqual([]);
      expect(appended.at(-1)).toEqual({ input: 'edit deploy', output: 'No runscript named "deploy".' });
      expect(existsSync(path.join(root, '.janissary'))).toBe(false);
      expect(existsSync(path.join(root, 'deploy'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps a line-suffixed bare name on ordinary file resolution', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'edit-runscript-'));
    try {
      mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
      writeFileSync(path.join(root, '.janissary', 'scripts', 'deploy.rs'), 'echo script');
      const targets: string[] = [];

      command.run('edit deploy:2', { label: 'janus', index: 0 }, editManagers(root, targets) as never);

      expect(targets).toEqual(['deploy']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function editManagers(
  root: string,
  targets: string[],
  appended: { input: string; output: string }[] = [],
): object {
  return {
    tab: {
      launchDir: root,
      cwdOf: () => root, workingDirOf: () => root,
      append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
    },
    openFile: {
      editForCommand: (_command: string, target: string) => { targets.push(target); },
    },
  };
}

describe('edit command run', () => {
  let appended: { input: string; output: string }[];
  let editCalls: { command: string; target: string; label: string; line?: number }[];
  let tab: { label: string };
  let managers: unknown;

  beforeEach(() => {
    appended = [];
    editCalls = [];
    tab = { label: 'janus' };
    managers = {
      tab: {
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
      openFile: {
        editForCommand: (command_: string, target: string, label: string, line?: number) => {
          editCalls.push({ command: command_, target, label, line });
        },
      },
    };
  });

  const run = (command_: string) => command.run!(command_, tab, managers as never);

  it('appends the command to the transcript before opening the editor tab', () => {
    run('edit foo.txt');

    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual({ input: 'edit foo.txt', output: '' });
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]).toMatchObject({ command: 'edit foo.txt', target: 'foo.txt', label: 'janus' });
  });

  it('appends before edit is called', () => {
    const callOrder: string[] = [];
    const orderedManagers = {
      tab: {
        append: () => { callOrder.push('append'); },
      },
      openFile: {
        editForCommand: () => { callOrder.push('edit'); },
      },
    };

    command.run!('edit foo.txt', tab, orderedManagers as never);
    expect(callOrder).toEqual(['append', 'edit']);
  });

  it('parses a trailing line number off the target', () => {
    run('edit src/foo.ts:42');

    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]).toMatchObject({ command: 'edit src/foo.ts:42', target: 'src/foo.ts', label: 'janus', line: 42 });
  });

  it('leaves line undefined when the target has no trailing line number', () => {
    run('edit src/foo.ts');

    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]).toMatchObject({ target: 'src/foo.ts', line: undefined });
  });

  it('shows usage when no target is provided', () => {
    run('edit');

    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual({ input: 'edit', output: 'Usage: edit <file>' });
    expect(editCalls).toHaveLength(0);
  });
});
