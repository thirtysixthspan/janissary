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
  let openCalls: { command: string; label: string }[];
  let tab: { label: string };
  let managers: unknown;

  beforeEach(() => {
    appended = [];
    openCalls = [];
    tab = { label: 'janus' };
    managers = {
      tab: {
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
      fileTree: {
        open: (command_: string, label: string) => {
          openCalls.push({ command: command_, label });
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
    expect(openCalls[0]).toEqual({ command: 'files ./src', label: 'janus' });
  });

  it('appends before fileTree.open is called', () => {
    const callOrder: string[] = [];
    const orderedManagers = {
      tab: {
        append: () => { callOrder.push('append'); },
      },
      fileTree: {
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
    expect(openCalls[0]).toEqual({ command: 'files left ./src', label: 'janus' });
  });
});
