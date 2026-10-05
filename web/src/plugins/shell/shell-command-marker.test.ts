import { describe, expect, it } from 'vitest';
import { readShellCwd, readShellMarker } from './shell-command-marker';

const NONCE = '0123456789abcdef0123456789abcdef';

function start(command: string, nonce = NONCE): string {
  const bytes = new TextEncoder().encode(command);
  return `C;${nonce};${btoa(String.fromCodePoint(...bytes))}`;
}

describe('readShellMarker', () => {
  it('decodes the command a signed start marker carries', () => {
    expect(readShellMarker(start('ls -la'), NONCE)).toEqual({ kind: 'C', command: 'ls -la' });
  });

  it('keeps unicode, quotes and newlines exactly as typed', () => {
    const command = 'for f in *; do\necho "héllo ✓ $f"\ndone';
    expect(readShellMarker(start(command), NONCE)).toEqual({ kind: 'C', command });
  });

  it('reads a signed start marker with no usable command as a start with no command', () => {
    expect(readShellMarker(`C;${NONCE}`, NONCE)).toEqual({ kind: 'C', command: undefined });
    expect(readShellMarker(`C;${NONCE};`, NONCE)).toEqual({ kind: 'C', command: undefined });
    expect(readShellMarker(start(' '.repeat(3)), NONCE)).toEqual({ kind: 'C', command: undefined });
    expect(readShellMarker(`C;${NONCE};not base64!`, NONCE)).toEqual({ kind: 'C', command: undefined });
    expect(readShellMarker(`C;${NONCE};${btoa('ÿþ')}`, NONCE)).toEqual({ kind: 'C', command: undefined });
  });

  it('reads signed prompt and setup-complete markers', () => {
    expect(readShellMarker(`D;${NONCE}`, NONCE)).toEqual({ kind: 'D' });
    expect(readShellMarker(`E;${NONCE}`, NONCE)).toEqual({ kind: 'E' });
  });

  it('ignores a marker that does not carry the nonce', () => {
    expect(readShellMarker('C', NONCE)).toBeUndefined();
    expect(readShellMarker('D', NONCE)).toBeUndefined();
    expect(readShellMarker('E', NONCE)).toBeUndefined();
    expect(readShellMarker(`C;${btoa('rm -rf ~')}`, NONCE)).toBeUndefined();
    expect(readShellMarker(start('ls', 'f'.repeat(32)), NONCE)).toBeUndefined();
    expect(readShellMarker(`D;${NONCE.toUpperCase()}`, NONCE)).toBeUndefined();
  });

  it('ignores a signed marker of a kind the hooks never emit', () => {
    expect(readShellMarker(`A;${NONCE}`, NONCE)).toBeUndefined();
  });
});

describe('readShellCwd', () => {
  it('decodes the path a signed directory report carries', () => {
    expect(readShellCwd(`${NONCE};file://localhost/work/child%20dir`, NONCE)).toBe('/work/child dir');
  });

  it('ignores a directory report that does not carry the nonce', () => {
    expect(readShellCwd('file://localhost/etc', NONCE)).toBeUndefined();
    expect(readShellCwd(`${'f'.repeat(32)};file://localhost/etc`, NONCE)).toBeUndefined();
  });

  it('ignores a signed report that is not a file URL', () => {
    expect(readShellCwd(`${NONCE};https://example.com/etc`, NONCE)).toBeUndefined();
    expect(readShellCwd(`${NONCE};not a url`, NONCE)).toBeUndefined();
    expect(readShellCwd(`${NONCE};file://localhost/bad%`, NONCE)).toBeUndefined();
  });
});
