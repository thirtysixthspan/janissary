import { describe, expect, it } from 'vitest';
import { stripShellSentinels } from './sentinel-strip.js';

describe('stripShellSentinels', () => {
  it('removes command-completion sentinel lines', () => {
    expect(stripShellSentinels('total 8\nsrc\n__JS_END_3_1789964749418__\n')).toBe('total 8\nsrc\n');
  });

  it('removes a pwd query with its answer line', () => {
    expect(stripShellSentinels('/remote/workspace\n__PWD_3_1789964749468__\n')).toBe('');
  });

  it('removes the pwd command echo when the shell echoes its input', () => {
    expect(stripShellSentinels('pwd\n/remote/workspace\n__PWD_3_1789964749468__\n')).toBe('');
  });

  it('keeps output above a command sentinel even when it looks like a path', () => {
    expect(stripShellSentinels('tsconfig.json\nvitest.config.ts\nweb\n__JS_END_3_1789964749418__\n')).toBe(
      'tsconfig.json\nvitest.config.ts\nweb\n',
    );
  });

  it('cleans a full reconnect transcript like the reported one', () => {
    const restored = [
      'tsconfig.json', 'vitest.config.ts', 'web', '__JS_END_3_1789964749418__',
      '/remote/workspace/harun', '__PWD_3_1789964749468__',
      'zsh: operation not permitted: ps', '__JS_END_3_1789964752762__',
      '/remote/workspace/harun', '__PWD_3_1789964756936__', '',
    ].join('\n');
    expect(stripShellSentinels(restored)).toBe('tsconfig.json\nvitest.config.ts\nweb\nzsh: operation not permitted: ps\n');
  });

  it('leaves ordinary output untouched, including double underscores that are not sentinels', () => {
    const text = '__init__.py\nmarkdown __bold__ text\n__main__\n';
    expect(stripShellSentinels(text)).toBe(text);
  });

  it('leaves a partial trailing line alone', () => {
    expect(stripShellSentinels('output\n__JS_END_3_17')).toBe('output\n__JS_END_3_17');
    expect(stripShellSentinels('/dir\n__PWD_3_')).toBe('/dir\n__PWD_3_');
  });

  it('is idempotent', () => {
    const once = stripShellSentinels('keep\n/remote/dir\n__PWD_3_1789964749468__\n');
    expect(once).toBe('keep\n');
    expect(stripShellSentinels(once)).toBe(once);
  });

  it('returns an empty string for empty input', () => {
    expect(stripShellSentinels('')).toBe('');
  });
});
