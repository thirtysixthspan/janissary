import { describe, it, expect } from 'vitest';

import { shellStartupArgs } from './shell-startup.js';

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
