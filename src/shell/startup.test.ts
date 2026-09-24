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
  it('runs a command through bash as a login and interactive shell', () => {
    expect(shellCommandArgs('/bin/bash', 'claude')).toEqual(['-l', '-i', '-c', 'claude']);
  });

  it('runs a command through zsh as a login and interactive shell', () => {
    expect(shellCommandArgs('/bin/zsh', 'claude')).toEqual(['-l', '-i', '-c', 'claude']);
  });

  it('reads the shell name out of any path', () => {
    expect(shellCommandArgs('/opt/homebrew/bin/zsh', 'codex')).toEqual(['-l', '-i', '-c', 'codex']);
    expect(shellCommandArgs('bash', 'codex')).toEqual(['-l', '-i', '-c', 'codex']);
  });

  it('keeps the login-only form for a shell whose flags are unverified', () => {
    expect(shellCommandArgs('/bin/sh', 'opencode')).toEqual(['-lc', 'opencode']);
    expect(shellCommandArgs('/usr/bin/fish', 'opencode')).toEqual(['-lc', 'opencode']);
  });

  it('keeps the login-only form for an empty shell path', () => {
    expect(shellCommandArgs('', 'opencode')).toEqual(['-lc', 'opencode']);
  });

  it('passes the command through untouched whichever form is used', () => {
    const command = `claude --model 'sonnet' --effort 'high'`;
    expect(shellCommandArgs('/bin/zsh', command).at(-1)).toBe(command);
    expect(shellCommandArgs('/usr/bin/fish', command).at(-1)).toBe(command);
  });
});
