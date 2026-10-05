import { describe, expect, it } from 'vitest';
import { readShellCwd, readShellMarker } from './shell-command-marker';

const NONCE = '0123456789abcdef0123456789abcdef';

function base64(text: string): string {
  return btoa(String.fromCodePoint(...new TextEncoder().encode(text)));
}

function start(command: string, nonce = NONCE): string {
  return `C;${nonce};${base64(command)}`;
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
  function report(path: string, nonce = NONCE): string {
    return `${nonce};${base64(path)}`;
  }

  it('decodes the path a signed directory report carries', () => {
    expect(readShellCwd(report('/work/child dir'), NONCE)).toBe('/work/child dir');
  });

  it('keeps characters a URL would read specially exactly as zsh reported them', () => {
    for (const path of ['/work/a#b', '/work/what?', '/work/100%', '/work/%41', String.raw`/work/back\slash`, '/work/ünï ✓', '/work/a;b']) {
      expect(readShellCwd(report(path), NONCE)).toBe(path);
    }
  });

  it('ignores a directory report that does not carry the nonce', () => {
    expect(readShellCwd(base64('/etc'), NONCE)).toBeUndefined();
    expect(readShellCwd(report('/etc', 'f'.repeat(32)), NONCE)).toBeUndefined();
  });

  it('ignores a report in file URL form, from this host or another', () => {
    expect(readShellCwd(`${NONCE};file://localhost/etc`, NONCE)).toBeUndefined();
    expect(readShellCwd(`${NONCE};file://remote.example.com/home/alex`, NONCE)).toBeUndefined();
    expect(readShellCwd('file://remote.example.com/home/alex', NONCE)).toBeUndefined();
  });

  it('ignores a signed report whose payload is empty, not base64, or not UTF-8 text', () => {
    expect(readShellCwd(NONCE, NONCE)).toBeUndefined();
    expect(readShellCwd(`${NONCE};`, NONCE)).toBeUndefined();
    expect(readShellCwd(`${NONCE};not base64!`, NONCE)).toBeUndefined();
    expect(readShellCwd(`${NONCE};${btoa('ÿþ')}`, NONCE)).toBeUndefined();
  });
});
