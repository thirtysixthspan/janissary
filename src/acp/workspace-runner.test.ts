import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type * as nodeOs from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_GREP_USAGE } from '../file-grep/command.js';
import { FILE_GLOB_USAGE } from '../file-glob/command.js';
import { FILE_READ_USAGE } from '../file-read/command.js';
import { FILE_WRITE_USAGE } from '../file-write/command.js';
import type * as Glob from '../file-glob/glob.js';
import type * as Grep from '../file-grep/grep.js';

const mocks = vi.hoisted(() => ({ globWorkspaceCommand: vi.fn(), grepWorkspaceCommand: vi.fn() }));
const home = vi.hoisted(() => ({ dir: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => home.dir),
}));

vi.mock('../file-glob/glob.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Glob>();
  mocks.globWorkspaceCommand.mockImplementation(actual.globWorkspaceCommand);
  return { ...actual, globWorkspaceCommand: mocks.globWorkspaceCommand };
});

vi.mock('../file-grep/grep.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Grep>();
  mocks.grepWorkspaceCommand.mockImplementation(actual.grepWorkspaceCommand);
  return { ...actual, grepWorkspaceCommand: mocks.grepWorkspaceCommand };
});

import { runWorkspaceCommandIn } from './workspace-runner.js';

let base: string;
let target: string;
let caller: string;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'janus-workspace-runner-'));
  target = path.join(base, 'target');
  caller = path.join(base, 'caller');
  mkdirSync(target);
  mkdirSync(caller);
  mkdirSync(path.join(base, 'home'));
  home.dir = path.join(base, 'home');
  mocks.globWorkspaceCommand.mockClear();
  mocks.grepWorkspaceCommand.mockClear();
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('runWorkspaceCommandIn routes to the target root', () => {
  beforeEach(() => {
    writeFileSync(path.join(target, 'a.md'), 'one\ntwo\n');
    writeFileSync(path.join(target, 'note.txt'), 'TODO here\n');
    writeFileSync(path.join(caller, 'a.md'), 'caller one\n');
    writeFileSync(path.join(caller, 'note.txt'), 'caller TODO\n');
  });

  it('reads from the target root', async () => {
    expect(await runWorkspaceCommandIn(target, 'file read a.md')).toBe('1\tone\n2\ttwo');
  });

  it('globs the target root', async () => {
    await expect(runWorkspaceCommandIn(target, 'file glob *.md')).resolves.toBe('a.md');
  });

  it('greps the target root', async () => {
    await expect(runWorkspaceCommandIn(target, 'file grep TODO')).resolves.toBe('note.txt:1: TODO here');
  });

  it('writes into the target root and leaves the caller untouched', async () => {
    await expect(runWorkspaceCommandIn(target, 'file write {"path":"new.md","content":"made"}'))
      .resolves.toBe('Wrote new.md.');
    expect(readFileSync(path.join(target, 'new.md'), 'utf8')).toBe('made');
    expect(existsSync(path.join(caller, 'new.md'))).toBe(false);
    expect(readFileSync(path.join(caller, 'a.md'), 'utf8')).toBe('caller one\n');
    expect(readFileSync(path.join(caller, 'note.txt'), 'utf8')).toBe('caller TODO\n');
  });

  it('edits in the target root and leaves the caller untouched', async () => {
    const edit = 'file edit {"path":"a.md","oldString":"one","newString":"uno"}';
    await expect(runWorkspaceCommandIn(target, edit)).resolves.toBe('Edited a.md (1 replacements).');
    expect(readFileSync(path.join(target, 'a.md'), 'utf8')).toBe('uno\ntwo\n');
    expect(readFileSync(path.join(caller, 'a.md'), 'utf8')).toBe('caller one\n');
  });
});

describe('runWorkspaceCommandIn command normalization', () => {
  beforeEach(() => {
    writeFileSync(path.join(target, 'a.md'), 'one\ntwo\n');
    writeFileSync(path.join(target, 'note.txt'), 'TODO here\n');
  });

  it('trims outer whitespace and removes one leading slash', async () => {
    expect(await runWorkspaceCommandIn(target, '  /file read a.md  ')).toBe('1\tone\n2\ttwo');
  });

  it('routes case-insensitive subcommands', async () => {
    await expect(runWorkspaceCommandIn(target, 'FILE GLOB *.md')).resolves.toBe('a.md');
    await expect(runWorkspaceCommandIn(target, 'File GREP TODO')).resolves.toBe('note.txt:1: TODO here');
    await expect(runWorkspaceCommandIn(target, 'FILE WRITE {"path":"c.md","content":"x"}'))
      .resolves.toBe('Wrote c.md.');
    await expect(runWorkspaceCommandIn(target, 'FiLe EdIt {"path":"a.md","oldString":"two","newString":"dos"}'))
      .resolves.toBe('Edited a.md (1 replacements).');
  });

  it('answers bare glob and grep lines with their own usage text', async () => {
    await expect(runWorkspaceCommandIn(target, 'file glob')).resolves.toBe(FILE_GLOB_USAGE);
    await expect(runWorkspaceCommandIn(target, 'file grep')).resolves.toBe(FILE_GREP_USAGE);
  });

  it('answers malformed mutation JSON with the write usage', async () => {
    await expect(runWorkspaceCommandIn(target, 'file write {nope')).resolves.toBe(FILE_WRITE_USAGE);
  });

  it('falls back to the read parser for an unrecognized command', async () => {
    expect(await runWorkspaceCommandIn(target, 'totally unknown command')).toBe(FILE_READ_USAGE);
  });
});

describe('runWorkspaceCommandIn stays inside the passed root', () => {
  beforeEach(() => {
    writeFileSync(path.join(caller, 'a.md'), 'caller one\n');
  });

  it('refuses a traversal read', async () => {
    expect(await runWorkspaceCommandIn(target, 'file read ../caller/a.md')).toMatch(/^Outside the workspace/);
    expect(readFileSync(path.join(caller, 'a.md'), 'utf8')).toBe('caller one\n');
  });

  it('refuses a traversal write', async () => {
    await expect(runWorkspaceCommandIn(target, 'file write {"path":"../caller/escape.md","content":"x"}'))
      .resolves.toMatch(/^Outside the workspace/);
    expect(existsSync(path.join(caller, 'escape.md'))).toBe(false);
  });

  it('refuses an outside-resolving symlink for reads and edits', async () => {
    writeFileSync(path.join(caller, 'secret.md'), 'caller secret\n');
    symlinkSync(path.join(caller, 'secret.md'), path.join(target, 'link.md'));
    expect(await runWorkspaceCommandIn(target, 'file read link.md')).toMatch(/^Outside the workspace/);
    const edit = 'file edit {"path":"link.md","oldString":"secret","newString":"nope"}';
    await expect(runWorkspaceCommandIn(target, edit)).resolves.toMatch(/^Outside the workspace/);
    expect(readFileSync(path.join(caller, 'secret.md'), 'utf8')).toBe('caller secret\n');
  });

  it('refuses a protected .janissary mutation without changing anything', async () => {
    mkdirSync(path.join(target, '.janissary'));
    writeFileSync(path.join(target, '.janissary', 'roles.json'), '{"roles":[]}');
    const write = 'file write {"path":".janissary/roles.json","content":"x"}';
    await expect(runWorkspaceCommandIn(target, write)).resolves.toMatch(/^Protected file/);
    expect(readFileSync(path.join(target, '.janissary', 'roles.json'), 'utf8')).toBe('{"roles":[]}');
  });
});

describe('runWorkspaceCommandIn signal handling', () => {
  beforeEach(() => {
    writeFileSync(path.join(target, 'a.md'), 'one\n');
    writeFileSync(path.join(target, 'note.txt'), 'TODO here\n');
  });

  it('passes the exact signal to glob, which aborts with its controller', async () => {
    const controller = new AbortController();
    const pending = runWorkspaceCommandIn(target, 'file glob *.md', controller.signal);
    expect(mocks.globWorkspaceCommand).toHaveBeenCalledWith(target, 'file glob *.md', controller.signal);
    const signal = mocks.globWorkspaceCommand.mock.calls[0]?.[2] as AbortSignal;
    expect(signal).toBe(controller.signal);
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
    await pending;
  });

  it('does not forward the signal to grep', async () => {
    await runWorkspaceCommandIn(target, 'file grep TODO', new AbortController().signal);
    expect(mocks.grepWorkspaceCommand).toHaveBeenCalledWith(target, 'file grep TODO');
    expect(mocks.grepWorkspaceCommand.mock.calls[0]).toHaveLength(2);
  });

  it('propagates a rejected grep call unchanged', async () => {
    const failure = new Error('grep worker stopped');
    mocks.grepWorkspaceCommand.mockImplementationOnce(() => Promise.reject(failure));
    await expect(runWorkspaceCommandIn(target, 'file grep TODO')).rejects.toBe(failure);
  });
});
