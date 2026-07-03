import { describe, it, expect, beforeEach } from 'vitest';
import { command } from './edit.js';

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

describe('edit command run', () => {
  let appended: { input: string; output: string }[];
  let editCalls: { command: string; target: string; label: string }[];
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
        edit: (command_: string, target: string, label: string) => {
          editCalls.push({ command: command_, target, label });
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
        edit: () => { callOrder.push('edit'); },
      },
    };

    command.run!('edit foo.txt', tab, orderedManagers as never);
    expect(callOrder).toEqual(['append', 'edit']);
  });

  it('shows usage when no target is provided', () => {
    run('edit');

    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual({ input: 'edit', output: 'Usage: edit <file>' });
    expect(editCalls).toHaveLength(0);
  });
});
