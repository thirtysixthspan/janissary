import { describe, it, expect, beforeEach } from 'vitest';
import { command } from './new-file.js';

describe('newfile command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('newfile');
  });

  it('matches newfile commands case-insensitively', () => {
    expect(command.match('newfile foo.txt')).toBe(true);
    expect(command.match('NEWFILE bar.md')).toBe(true);
  });

  it('does not match non-newfile input', () => {
    expect(command.match('newfiled')).toBe(false);
    expect(command.match('edit foo.txt')).toBe(false);
  });
});

describe('newfile command run', () => {
  let appended: { input: string; output: string }[];
  let newFileCalls: { command: string; target: string; label: string }[];
  let tab: { label: string };
  let managers: unknown;

  beforeEach(() => {
    appended = [];
    newFileCalls = [];
    tab = { label: 'janus' };
    managers = {
      tab: {
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
      openFile: {
        newFile: (command_: string, target: string, label: string) => {
          newFileCalls.push({ command: command_, target, label });
        },
      },
    };
  });

  const run = (command_: string) => command.run!(command_, tab, managers as never);

  it('appends the command to the transcript before opening the editor tab', () => {
    run('newfile untitled.md');

    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual({ input: 'newfile untitled.md', output: '' });
    expect(newFileCalls).toHaveLength(1);
    expect(newFileCalls[0]).toMatchObject({ command: 'newfile untitled.md', target: 'untitled.md', label: 'janus' });
  });

  it('appends before newFile is called', () => {
    const callOrder: string[] = [];
    const orderedManagers = {
      tab: {
        append: () => { callOrder.push('append'); },
      },
      openFile: {
        newFile: () => { callOrder.push('newFile'); },
      },
    };

    command.run!('newfile untitled.md', tab, orderedManagers as never);
    expect(callOrder).toEqual(['append', 'newFile']);
  });

  it('shows usage when no target is provided', () => {
    run('newfile');

    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual({ input: 'newfile', output: 'Usage: newfile <file>' });
    expect(newFileCalls).toHaveLength(0);
  });
});
