import { describe, it, expect } from 'vitest';
import { resolveCommand } from '../resolve.js';

describe('resolveCommand', () => {
  it.each(['msg worker info hello', 'broadcast all info hello'])('does not register removed command %s', (line) => {
    expect(resolveCommand(line).kind).toBe('unknown');
  });
  it('treats empty/whitespace input as empty', () => {
    expect(resolveCommand('')).toEqual({ kind: 'empty' });
    expect(resolveCommand(' '.repeat(3))).toEqual({ kind: 'empty' });
  });

  it('treats a leading `!` as a request to run a shell command', () => {
    expect(resolveCommand('!ps')).toEqual({ kind: 'shell', cmd: 'ps' });
    expect(resolveCommand('! git status')).toEqual({ kind: 'shell', cmd: 'git status' });
    expect(resolveCommand('!')).toEqual({ kind: 'shell', cmd: '' });
  });

  it('does not run a backtick-prefixed command in the shell', () => {
    const result = resolveCommand('`ls -la');
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') expect(result.output).toContain('Unknown command');
  });

  it('requires `!`: a bare shell command name is not auto-run', () => {
    const result = resolveCommand('ls');
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') expect(result.output).toContain('Unknown command');
  });

  it('returns textual output for the help built-in', () => {
    const result = resolveCommand('help');
    expect(result.kind).toBe('output');
    if (result.kind === 'output') expect(result.output).toContain('Commands');
  });

  it('returns the unknown-command message for unrecognized non-shell input', () => {
    const result = resolveCommand('definitelynotacommand');
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') expect(result.output).toContain('Unknown command');
  });

  it('classifies app/tab-management built-ins', () => {
    expect(resolveCommand('shell')).toEqual({ kind: 'app', name: 'shell', cmd: 'shell' });
    expect(resolveCommand('shell docs --offline')).toEqual({
      kind: 'app', name: 'shell', cmd: 'shell docs --offline',
    });
    expect(resolveCommand('next')).toEqual({ kind: 'app', name: 'next', cmd: 'next' });
    expect(resolveCommand('agent execute task.md')).toEqual({ kind: 'app', name: 'agent', cmd: 'agent execute task.md' });
    expect(resolveCommand('acp summarize this repo')).toEqual({ kind: 'app', name: 'acp', cmd: 'acp summarize this repo' });
    expect(resolveCommand('db sqlite query mydb SELECT 1')).toEqual({ kind: 'app', name: 'db', cmd: 'db sqlite query mydb SELECT 1' });
    expect(resolveCommand('browser goto https://example.com')).toEqual({ kind: 'app', name: 'browser', cmd: 'browser goto https://example.com' });
    expect(resolveCommand('connection close sqlite:mydb')).toEqual({ kind: 'app', name: 'connection', cmd: 'connection close sqlite:mydb' });
    expect(resolveCommand('clear')).toEqual({ kind: 'app', name: 'clear', cmd: 'clear' });
    expect(resolveCommand('hist')).toEqual({ kind: 'app', name: 'hist', cmd: 'hist' });
    expect(resolveCommand('close')).toEqual({ kind: 'app', name: 'close', cmd: 'close' });
    expect(resolveCommand('quit')).toEqual({ kind: 'app', name: 'quit', cmd: 'quit' });
    expect(resolveCommand('exit')).toEqual({ kind: 'app', name: 'close', cmd: 'exit' });
    expect(resolveCommand('video clip.mp4')).toEqual({
      kind: 'app', name: 'video', cmd: 'video clip.mp4',
    });
  });

  // Both used to be matched by inline regular expressions in `CommandManager.run` ahead of this
  // function, so every dispatcher that consults only the registry classified them as unknown.
  it('classifies harness and ssh, which used to be dispatched ahead of the registry', () => {
    expect(resolveCommand('harness claude')).toEqual({ kind: 'app', name: 'harness', cmd: 'harness claude' });
    expect(resolveCommand('harness')).toEqual({ kind: 'app', name: 'harness', cmd: 'harness' });
    expect(resolveCommand('ssh build-box')).toEqual({ kind: 'app', name: 'ssh', cmd: 'ssh build-box' });
    expect(resolveCommand('/ssh build-box')).toEqual({ kind: 'app', name: 'ssh', cmd: 'ssh build-box' });
  });

  // The classification comes from the classifier's own `kind` now, not from the leading words of
  // the message it returns — so rewording that message cannot turn every unrecognized command into
  // a known one carrying output, which is what would have stopped route recognition running.
  it('classifies unknown by kind, independent of the message wording', () => {
    const result = resolveCommand('zzz-not-a-command');
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') expect(result.output).not.toBe('');
  });

  it('strips a leading slash to force the built-in dispatcher', () => {
    expect(resolveCommand('/clear')).toEqual({ kind: 'app', name: 'clear', cmd: 'clear' });
  });
});
