import { describe, it, expect } from 'vitest';
import { resolveCommand } from './resolve.js';

describe('resolveCommand', () => {
  it('treats empty/whitespace input as empty', () => {
    expect(resolveCommand('')).toEqual({ kind: 'empty' });
    expect(resolveCommand('   ')).toEqual({ kind: 'empty' });
  });

  it('classifies backtick-prefixed input as a shell command', () => {
    expect(resolveCommand('`ls -la')).toEqual({ kind: 'shell', cmd: 'ls -la' });
  });

  it('classifies a bare known shell command as shell (auto-run)', () => {
    // ls is in the shell-command registry, so a bare `ls` runs in the shell.
    expect(resolveCommand('ls')).toEqual({ kind: 'shell', cmd: 'ls' });
  });

  it('returns textual output for built-in commands', () => {
    expect(resolveCommand('about')).toEqual({ kind: 'output', cmd: 'about', output: 'Custom CLI built with Ink & React.' });
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
