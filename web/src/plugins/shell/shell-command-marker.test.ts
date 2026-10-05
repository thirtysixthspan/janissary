import { describe, expect, it } from 'vitest';
import { decodeShellCommand } from './shell-command-marker';

function marker(command: string): string {
  const bytes = new TextEncoder().encode(command);
  return `C;${btoa(String.fromCodePoint(...bytes))}`;
}

describe('decodeShellCommand', () => {
  it('decodes the command a start marker carries', () => {
    expect(decodeShellCommand(marker('ls -la'))).toBe('ls -la');
  });

  it('keeps unicode, quotes and newlines exactly as typed', () => {
    const command = 'for f in *; do\necho "héllo ✓ $f"\ndone';
    expect(decodeShellCommand(marker(command))).toBe(command);
  });

  it('carries no command for a bare marker or an empty one', () => {
    expect(decodeShellCommand('C')).toBeUndefined();
    expect(decodeShellCommand('C;')).toBeUndefined();
    expect(decodeShellCommand(marker(' '.repeat(3)))).toBeUndefined();
  });

  it('carries no command for a payload that is not base64 text', () => {
    expect(decodeShellCommand('C;not base64!')).toBeUndefined();
    expect(decodeShellCommand(`C;${btoa('ÿþ')}`)).toBeUndefined();
  });
});
