import { describe, it, expect, vi } from 'vitest';
import { createPtyShell, ptyShellArgs } from './shell-pty-session.js';
import { executeShellCmd } from './shell.js';

// Stands in for the pseudo-terminal: records what was written to the shell and lets a test push
// bytes back as the shell would, including the echo a real tty produces.
function fakePty() {
  const written: string[] = [];
  let emit: (data: string) => void = () => {};
  const shell = createPtyShell((onData) => {
    emit = onData;
    return {
      id: 'pty7',
      write: (data: string) => { written.push(data); },
      kill: vi.fn(),
    };
  });
  return { ...shell, written, emit: (data: string) => emit(data) };
}

// What a real tty sends back before the shell is ready: the seed command echoed verbatim (quotes
// and all, since `stty -echo` has not taken effect for the line that sets it), then the marker the
// seed's `echo` actually prints.
function seedEcho(written: string[]): string {
  const seed = written[0];
  const marker = /"(__JS_SEED_)""([a-f\d]+__)"/.exec(seed);
  return `${seed}${marker?.[1] ?? ''}${marker?.[2] ?? ''}\r\n`;
}

const flush = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });

describe('createPtyShell', () => {
  it('exposes the shell process shape the execution layer consumes', () => {
    const { shell, ptyId } = fakePty();
    expect(ptyId).toBe('pty7');
    expect(shell.stdin?.writable).toBe(true);
    expect(typeof shell.stdout?.on).toBe('function');
    expect(typeof shell.stderr?.on).toBe('function');
  });

  it('seeds the shell with echo and prompts turned off before anything else', () => {
    const { written } = fakePty();
    expect(written[0]).toContain('stty -echo');
    expect(written[0]).toContain("PS1=''");
    expect(written[0]).toContain("PS2=''");
  });

  it('swallows the seed echo so it never reaches a command buffer', async () => {
    const pty = fakePty();
    const chunks: string[] = [];
    pty.shell.stdout?.on('data', (chunk: string) => { chunks.push(chunk); });

    pty.emit(seedEcho(pty.written));
    await flush();
    expect(chunks.join('')).toBe('');

    pty.emit('real output\r\n');
    await flush();
    expect(chunks.join('')).toBe('real output\r\n');
  });

  it('forwards writes to the pseudo-terminal', () => {
    const pty = fakePty();
    pty.emit(seedEcho(pty.written));
    pty.shell.stdin?.write('echo hi\n');
    expect(pty.written.at(-1)).toBe('echo hi\n');
  });

  it('lets a command complete on its real output rather than an echoed sentinel', async () => {
    const pty = fakePty();
    pty.emit(seedEcho(pty.written));

    const onComplete = vi.fn();
    executeShellCmd(pty.shell, 'echo hi', 0, () => {}, onComplete);

    // With echo suppressed the shell sends back only the output and the sentinel — the command
    // line itself, which contains the sentinel text, never comes back to match early.
    const sentinel = /echo "(__JS_END_[^"]+)"/.exec(pty.written.at(-1) ?? '')?.[1] ?? '';
    pty.emit(`hi\r\n${sentinel}\r\n`);
    await flush();

    expect(onComplete).toHaveBeenCalledWith('hi');
  });

  it('kills the session once', () => {
    const pty = fakePty();
    expect(pty.shell.kill()).toBe(true);
    expect(pty.shell.kill()).toBe(false);
  });
});

describe('ptyShellArgs', () => {
  it('asks for the shell itself with its startup files suppressed', () => {
    const previousShell = process.env.SHELL;
    try {
      process.env.SHELL = '/bin/zsh';
      expect(ptyShellArgs()).toEqual(['--no-rcs']);
      process.env.SHELL = '/bin/bash';
      expect(ptyShellArgs()).toEqual(['--norc', '--noprofile']);
      expect(ptyShellArgs()).not.toContain('-lc');
    } finally {
      if (previousShell === undefined) delete process.env.SHELL; else process.env.SHELL = previousShell;
    }
  });
});
