import { describe, expect, it } from 'vitest';
import { PendingShellLines } from './pending-shell-lines';

describe('PendingShellLines', () => {
  it('claims a line the bar sent, once', () => {
    const pending = new PendingShellLines();
    pending.expect('ls -la');

    expect(pending.claim('ls -la')).toBe(true);
    expect(pending.claim('ls -la')).toBe(false);
  });

  it('does not claim a command the bar never sent', () => {
    const pending = new PendingShellLines();
    pending.expect('ls');

    expect(pending.claim('pwd')).toBe(false);
    expect(pending.claim('ls')).toBe(true);
  });

  it('consumes a multi-line submission one command at a time', () => {
    const pending = new PendingShellLines();
    pending.expect('cd src\nls');

    expect(pending.claim('cd src')).toBe(true);
    expect(pending.claim('ls')).toBe(true);
    expect(pending.claim('ls')).toBe(false);
  });

  it('drops earlier lines zsh never ran once a later one is claimed', () => {
    const pending = new PendingShellLines();
    pending.expect('answer to a prompt');
    pending.expect('make');

    expect(pending.claim('make')).toBe(true);
    expect(pending.claim('answer to a prompt')).toBe(false);
  });
});
