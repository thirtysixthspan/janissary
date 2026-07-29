import { describe, it, expect } from 'vitest';
import { parseSshCommand } from './ssh.js';

describe('parseSshCommand', () => {
  it('returns an error for a missing destination', () => {
    const result = parseSshCommand('ssh');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Usage/i);
  });

  it('parses a bare host, with no options', () => {
    const result = parseSshCommand('ssh devbox');
    expect(result).toEqual({ command: 'ssh devbox', destination: 'devbox', label: 'devbox', options: [] });
  });

  it('parses a user@host destination, deriving the label from the host', () => {
    const result = parseSshCommand('ssh admin@10.0.0.5');
    expect(result).toEqual({
      command: 'ssh admin@10.0.0.5', destination: 'admin@10.0.0.5', label: '10.0.0.5', options: [],
    });
  });

  it('skips value-taking flags to find the destination', () => {
    const result = parseSshCommand('ssh -p 2222 -i ~/.ssh/id admin@host');
    expect('error' in result).toBe(false);
    expect((result as { destination: string }).destination).toBe('admin@host');
    expect((result as { label: string }).label).toBe('host');
  });

  it('skips a boolean flag to find the destination', () => {
    const result = parseSshCommand('ssh -v host');
    expect('error' in result).toBe(false);
    expect((result as { destination: string }).destination).toBe('host');
  });

  it('strips an ssh:// scheme, deriving the label from the host', () => {
    const result = parseSshCommand('ssh ssh://root@host:2222');
    expect('error' in result).toBe(false);
    expect((result as { destination: string }).destination).toBe('root@host:2222');
    expect((result as { label: string }).label).toBe('host');
  });

  it('keeps the command verbatim, including trailing remote-command tokens', () => {
    const result = parseSshCommand('ssh devbox ls -la');
    expect('error' in result).toBe(false);
    expect((result as { command: string }).command).toBe('ssh devbox ls -la');
    expect((result as { label: string }).label).toBe('devbox');
  });

  it('returns the non-destination tokens as options, in order', () => {
    const result = parseSshCommand('ssh -p 2222 -i ~/.ssh/id admin@host');
    expect((result as { options: string[] }).options).toEqual(['-p', '2222', '-i', '~/.ssh/id']);
  });

  it('lifts the destination out by position, not by token equality', () => {
    const result = parseSshCommand('ssh -o host devbox');
    expect((result as { destination: string }).destination).toBe('devbox');
    expect((result as { options: string[] }).options).toEqual(['-o', 'host']);
  });

  it('returns trailing remote-command tokens as options too', () => {
    const result = parseSshCommand('ssh devbox ls -la');
    expect((result as { options: string[] }).options).toEqual(['ls', '-la']);
  });
});
