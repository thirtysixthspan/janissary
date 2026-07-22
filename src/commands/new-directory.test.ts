import { describe, it, expect, beforeEach } from 'vitest';
import { command } from './new-directory.js';

describe('newdir command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('newdir');
  });

  it('matches newdir commands case-insensitively', () => {
    expect(command.match('newdir untitled')).toBe(true);
    expect(command.match('NEWDIR src/untitled')).toBe(true);
  });

  it('does not match unrelated input', () => {
    expect(command.match('newdirectory')).toBe(false);
    expect(command.match('mkdir untitled')).toBe(false);
  });
});

describe('newdir command run', () => {
  let appended: { input: string; output: string }[];
  let calls: { target: string; label: string }[];

  beforeEach(() => {
    appended = [];
    calls = [];
  });

  const run = (text: string) => command.run(text, { label: 'files', index: 2 }, {
    tab: { append: (_label, entry) => { appended.push(entry); } },
    openFile: { newDirectory: (target, label) => { calls.push({ target, label }); } },
  } as never);

  it('delegates a valid target and records the command', () => {
    run('newdir src/untitled');

    expect(appended).toEqual([{ input: 'newdir src/untitled', output: '' }]);
    expect(calls).toEqual([{ target: 'src/untitled', label: 'files' }]);
  });

  it('shows usage without creating a directory when the target is missing', () => {
    run('newdir');

    expect(appended).toEqual([{ input: 'newdir', output: 'Usage: newdir <directory>' }]);
    expect(calls).toHaveLength(0);
  });
});
