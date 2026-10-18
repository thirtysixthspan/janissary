import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command, runRunscriptNow } from './execute.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.length = 0;
});

function setup(script?: string): {
  root: string;
  appended: { input: string; output: string }[];
  batches: string[][];
  labels: string[];
  events: string[];
  ensure: () => Promise<{ status: 'ok'; tab: object } | { status: 'failed'; reason: string }>;
  managers: never;
} {
  const root = mkdtempSync(path.join(tmpdir(), 'execute-command-'));
  directories.push(root);
  if (script !== undefined) {
    const scripts = path.join(root, '.janissary', 'scripts');
    mkdirSync(scripts, { recursive: true });
    writeFileSync(path.join(scripts, 'deploy.rs'), script);
  }
  const appended: { input: string; output: string }[] = [];
  const batches: string[][] = [];
  const labels: string[] = [];
  const events: string[] = [];
  const ensure = async () => {
    events.push('ensure');
    return { status: 'ok' as const, tab: {} };
  };
  const managers = {
    tab: {
      launchDir: root,
      append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
      enqueueSystemBatch: (label: string, lines: string[]) => {
        events.push('enqueue');
        labels.push(label);
        if (lines.length > 0) batches.push(lines);
      },
    },
    systemShell: { ensure },
  } as never;
  return { root, appended, batches, labels, events, ensure, managers };
}

describe('execute command', () => {
  it('ensures the system shell and appends parsed lines as one batch', async () => {
    const { batches, events, managers } = setup('pwd\n# comment\nfalse\n\n echo done\n');

    await command.run('execute deploy', { label: 'janus', index: 0 }, managers);

    expect(batches).toEqual([['pwd', 'false', ' echo done']]);
    expect(events).toEqual(['ensure', 'enqueue']);
  });

  it('succeeds on an empty script without adding queue rows', async () => {
    const { batches, managers } = setup('# only a comment\n');

    await command.run('execute deploy', { label: 'janus', index: 0 }, managers);

    expect(batches).toEqual([]);
  });

  it('reports a missing script and does not ensure the shell or enqueue', async () => {
    const { root, appended, batches, managers } = setup();

    await command.run('execute deploy', { label: 'janus', index: 0 }, managers);

    expect(appended).toEqual([{ input: 'execute deploy', output: 'No runscript named "deploy".' }]);
    expect(batches).toEqual([]);
    expect(existsSync(path.join(root, '.janissary'))).toBe(false);
  });

  it('rejects invalid names and leaves the filesystem and queue unchanged', async () => {
    const { root, appended, batches, managers } = setup();

    await command.run('execute ../deploy', { label: 'janus', index: 0 }, managers);

    expect(appended[0]?.output).toBe('Usage: execute <name>');
    expect(batches).toEqual([]);
    expect(existsSync(path.join(root, '.janissary'))).toBe(false);
  });

  it('leaves the queue unchanged when system shell startup fails', async () => {
    const state = setup('echo hello');
    const managers = {
      ...state.managers,
      systemShell: { ensure: async () => ({ status: 'failed' as const, reason: 'failed' }) },
    } as never;

    await command.run('execute deploy', { label: 'janus', index: 0 }, managers);

    expect(state.batches).toEqual([]);
  });
});

describe('runRunscriptNow', () => {
  it('returns the missing-script text without ensuring the shell', async () => {
    const { events, managers } = setup();

    expect(await runRunscriptNow(managers, 'deploy')).toBe('No runscript named "deploy".');
    expect(events).toEqual([]);
  });

  it('returns the read-failure text for a symlinked runscript without ensuring the shell', async () => {
    const { root, events, managers } = setup('echo hello\n');
    symlinkSync(path.join(root, '.janissary', 'scripts', 'deploy.rs'), path.join(root, '.janissary', 'scripts', 'link.rs'));

    expect(await runRunscriptNow(managers, 'link')).toBe('Could not read runscript "link".');
    expect(events).toEqual([]);
  });

  it('enqueues the parsed lines to the system label and returns nothing', async () => {
    const { batches, labels, events, managers } = setup('pwd\n# comment\necho done\n');

    expect(await runRunscriptNow(managers, 'deploy')).toBeUndefined();
    expect(labels).toEqual(['system']);
    expect(batches).toEqual([['pwd', 'echo done']]);
    expect(events).toEqual(['ensure', 'enqueue']);
  });

  it('returns nothing and enqueues nothing when system shell startup fails', async () => {
    const state = setup('echo hello\n');
    const managers = {
      ...state.managers,
      systemShell: { ensure: async () => ({ status: 'failed' as const, reason: 'failed' }) },
    } as never;

    expect(await runRunscriptNow(managers, 'deploy')).toBeUndefined();
    expect(state.batches).toEqual([]);
    expect(state.labels).toEqual([]);
  });
});
