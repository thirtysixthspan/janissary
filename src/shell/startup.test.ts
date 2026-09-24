import { describe, it, expect } from 'vitest';

import { shellCommandArgs, shellStartupArgs } from './startup.js';

describe('shellStartupArgs', () => {
  it('gives bash its own rc and profile flags', () => {
    expect(shellStartupArgs('/bin/bash')).toEqual(['--norc', '--noprofile']);
  });

  it('gives zsh the flag zsh accepts', () => {
    expect(shellStartupArgs('/bin/zsh')).toEqual(['--no-rcs']);
  });

  it('reads the shell name out of any path', () => {
    expect(shellStartupArgs('/usr/local/bin/zsh')).toEqual(['--no-rcs']);
    expect(shellStartupArgs('bash')).toEqual(['--norc', '--noprofile']);
  });

  it('gives an unrecognized shell no flags', () => {
    expect(shellStartupArgs('/bin/sh')).toEqual([]);
    expect(shellStartupArgs('/usr/bin/fish')).toEqual([]);
  });

  it('gives an empty shell path no flags', () => {
    expect(shellStartupArgs('')).toEqual([]);
  });
});

describe('shellCommandArgs', () => {
  it('runs a command through bash as an interactive shell', () => {
    expect(shellCommandArgs('/bin/bash', 'claude')).toEqual(['-i', '-c', 'claude']);
  });

  it('runs a command through zsh as an interactive shell', () => {
    expect(shellCommandArgs('/bin/zsh', 'claude')).toEqual(['-i', '-c', 'claude']);
  });

  it('reads the shell name out of any path', () => {
    expect(shellCommandArgs('/opt/homebrew/bin/zsh', 'codex')).toEqual(['-i', '-c', 'codex']);
    expect(shellCommandArgs('bash', 'codex')).toEqual(['-i', '-c', 'codex']);
  });

  it('gives a shell whose flags are unverified the bare command form', () => {
    expect(shellCommandArgs('/bin/sh', 'opencode')).toEqual(['-c', 'opencode']);
    expect(shellCommandArgs('/usr/bin/fish', 'opencode')).toEqual(['-c', 'opencode']);
  });

  it('gives an empty shell path the bare command form', () => {
    expect(shellCommandArgs('', 'opencode')).toEqual(['-c', 'opencode']);
  });

  // A login shell sources /etc/zprofile, whose path_helper rebuilds PATH with /etc/paths.d ahead of
  // whatever the caller had — so the launch would resolve a bare binary name differently from the
  // user's own terminal. No shell may be given `-l` or a bundled form that implies it.
  it('never starts a login shell, for any shell', () => {
    for (const shell of ['/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/fish', '']) {
      const args = shellCommandArgs(shell, 'claude');
      expect(args.filter((arg) => arg.startsWith('-')).some((flag) => flag.includes('l'))).toBe(false);
    }
  });

  it('passes the command through untouched whichever form is used', () => {
    const command = `claude --model 'sonnet' --effort 'high'`;
    expect(shellCommandArgs('/bin/zsh', command).at(-1)).toBe(command);
    expect(shellCommandArgs('/usr/bin/fish', command).at(-1)).toBe(command);
  });
});
