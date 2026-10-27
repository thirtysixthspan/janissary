import { describe, it, expect, beforeEach } from 'vitest';
import { command } from './files.js';

describe('files command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('files');
  });

  it('matches files commands case-insensitively', () => {
    expect(command.match('files')).toBe(true);
    expect(command.match('files foo')).toBe(true);
    expect(command.match('FILES foo')).toBe(true);
  });

  it('does not match non-files input', () => {
    expect(command.match('filesystem')).toBe(false);
    expect(command.match('edit foo.txt')).toBe(false);
  });
});

describe('files command run', () => {
  let appended: { input: string; output: string }[];
  let openCalls: { args: unknown; label: string; out: (output: string) => void }[];
  let printCalls: { tab: string }[];
  let tab: { label: string };
  let managers: unknown;

  beforeEach(() => {
    appended = [];
    openCalls = [];
    printCalls = [];
    tab = { label: 'janus' };
    managers = {
      tab: {
        tabs: [{ label: 'review notes' }],
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
      fileNavigator: {
        printView: async (target: { label: string }) => {
          printCalls.push({ tab: target.label });
          return 'files expand src $root';
        },
        open: (args: unknown, label: string, out: (output: string) => void) => {
          openCalls.push({ args, label, out });
        },
      },
    };
  });

  const run = (command_: string) => command.run!(command_, tab, managers as never);

  it('appends the command to the transcript before opening the file tree tab', () => {
    run('files ./src');

    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual({ input: 'files ./src', output: '' });
    expect(openCalls).toHaveLength(1);
    expect(openCalls[0]).toMatchObject({
      args: { kind: 'open', dock: null, steps: [], target: './src' }, label: 'janus',
    });
    expect(openCalls[0]?.out).toBeTypeOf('function');
  });

  it('appends before fileNavigator.open is called', () => {
    const callOrder: string[] = [];
    const orderedManagers = {
      tab: {
        append: () => { callOrder.push('append'); },
      },
      fileNavigator: {
        open: () => { callOrder.push('open'); },
      },
    };

    command.run!('files', tab, orderedManagers as never);
    expect(callOrder).toEqual(['append', 'open']);
  });

  it('appends and opens for the left/right docking variants', () => {
    run('files left ./src');

    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual({ input: 'files left ./src', output: '' });
    expect(openCalls[0]).toMatchObject({
      args: { kind: 'open', dock: 'left', steps: [], target: './src' }, label: 'janus',
    });
  });

  it('appends one parser error for a malformed view clause', () => {
    run('files expand "src');

    expect(appended).toEqual([{ input: 'files expand "src', output: 'files: unterminated quote' }]);
    expect(openCalls).toEqual([]);
  });

  it('appends one parser error for a malformed print request', () => {
    run('files print a b');

    expect(appended).toEqual([{ input: 'files print a b', output: 'Usage: files print <tab>.' }]);
    expect(printCalls).toEqual([]);
    expect(openCalls).toEqual([]);
  });

  it('passes a with clause through alongside the other clauses', () => {
    run('files in claude on left with size');

    expect(appended[0]).toEqual({ input: 'files in claude on left with size', output: '' });
    expect(openCalls[0]).toMatchObject({
      args: { kind: 'open', inLabel: 'claude', dock: 'left', details: 'size', steps: [], target: '' },
      label: 'janus',
    });
  });

  it('prints a named tree in one transcript entry without opening it', async () => {
    await run('files print "review notes"');

    expect(printCalls).toEqual([{ tab: 'review notes' }]);
    expect(appended).toEqual([{ input: 'files print "review notes"', output: 'files expand src $root' }]);
    expect(openCalls).toEqual([]);
  });

  it('forwards output from opening a parsed tree through the command output path', () => {
    run('files ./missing');
    openCalls[0]?.out('files: ./missing: not a directory');

    expect(appended).toEqual([
      { input: 'files ./missing', output: '' },
      { input: 'files ./missing', output: 'files: ./missing: not a directory' },
    ]);
  });

  it('resolves a missing print target in the command layer', async () => {
    await run('files print ghost');

    expect(printCalls).toEqual([]);
    expect(appended).toEqual([{ input: 'files print ghost', output: 'No tab named "ghost".' }]);
  });
});
