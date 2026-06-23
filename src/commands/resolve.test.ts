import { describe, it, expect } from 'vitest';
import { resolveCommand } from '../resolve.js';

describe('resolveCommand', () => {
  it('treats empty/whitespace input as empty', () => {
    expect(resolveCommand('')).toEqual({ kind: 'empty' });
    expect(resolveCommand('   ')).toEqual({ kind: 'empty' });
  });

  it('classifies the `shell` keyword as a shell command, stripping the keyword', () => {
    expect(resolveCommand('shell ls -la')).toEqual({ kind: 'shell', cmd: 'ls -la' });
    expect(resolveCommand('SHELL git status')).toEqual({ kind: 'shell', cmd: 'git status' });
  });

  it('treats a bare `shell` as an empty shell command', () => {
    expect(resolveCommand('shell')).toEqual({ kind: 'shell', cmd: '' });
  });

  it('does not treat a word merely starting with "shell" as the keyword', () => {
    const res = resolveCommand('shellcheck script.sh');
    expect(res.kind).toBe('output');
    if (res.kind === 'output') expect(res.output).toContain('Unknown command');
  });

  it('does not run a backtick-prefixed command in the shell', () => {
    const res = resolveCommand('`ls -la');
    expect(res.kind).toBe('output');
    if (res.kind === 'output') expect(res.output).toContain('Unknown command');
  });

  it('requires the `shell` keyword: a bare command name is not auto-run', () => {
    const res = resolveCommand('ls');
    expect(res.kind).toBe('output');
    if (res.kind === 'output') expect(res.output).toContain('Unknown command');
  });

  it('returns textual output for the help built-in', () => {
    const res = resolveCommand('help');
    expect(res.kind).toBe('output');
    if (res.kind === 'output') expect(res.output).toContain('Commands');
  });

  it('returns the unknown-command message for unrecognized non-shell input', () => {
    const res = resolveCommand('definitelynotacommand');
    expect(res.kind).toBe('output');
    if (res.kind === 'output') expect(res.output).toContain('Unknown command');
  });

  it('classifies app/tab-management built-ins', () => {
    expect(resolveCommand('agent bilal')).toEqual({ kind: 'app', name: 'agent', cmd: 'agent bilal' });
    expect(resolveCommand('next')).toEqual({ kind: 'app', name: 'next', cmd: 'next' });
    expect(resolveCommand('msg bilal info hi')).toEqual({ kind: 'app', name: 'msg', cmd: 'msg bilal info hi' });
    expect(resolveCommand('broadcast all info hi')).toEqual({ kind: 'app', name: 'broadcast', cmd: 'broadcast all info hi' });
    expect(resolveCommand('acp summarize this repo')).toEqual({ kind: 'app', name: 'acp', cmd: 'acp summarize this repo' });
    expect(resolveCommand('db sqlite query mydb SELECT 1')).toEqual({ kind: 'app', name: 'db', cmd: 'db sqlite query mydb SELECT 1' });
    expect(resolveCommand('browser goto https://example.com')).toEqual({ kind: 'app', name: 'browser', cmd: 'browser goto https://example.com' });
    expect(resolveCommand('connection close sqlite:mydb')).toEqual({ kind: 'app', name: 'connection', cmd: 'connection close sqlite:mydb' });
    expect(resolveCommand('clear')).toEqual({ kind: 'app', name: 'clear', cmd: 'clear' });
    expect(resolveCommand('state')).toEqual({ kind: 'app', name: 'state', cmd: 'state' });
    expect(resolveCommand('hist')).toEqual({ kind: 'app', name: 'hist', cmd: 'hist' });
    expect(resolveCommand('close')).toEqual({ kind: 'app', name: 'close', cmd: 'close' });
    expect(resolveCommand('quit')).toEqual({ kind: 'app', name: 'quit', cmd: 'quit' });
    expect(resolveCommand('exit')).toEqual({ kind: 'app', name: 'quit', cmd: 'exit' });
  });

  it('strips a leading slash to force the built-in dispatcher', () => {
    expect(resolveCommand('/clear')).toEqual({ kind: 'app', name: 'clear', cmd: 'clear' });
  });
});
