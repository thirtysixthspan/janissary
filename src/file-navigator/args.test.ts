import { describe, it, expect } from 'vitest';
import { parseFileNavigatorArgs } from './args.js';

describe('parseFileNavigatorArgs', () => {
  it('leaves details unset when no with clause is given', () => {
    expect(parseFileNavigatorArgs('src')).toEqual({ inLabel: undefined, dock: null, details: undefined, target: 'src' });
  });

  it('parses each of the four detail modes', () => {
    for (const mode of ['name', 'size', 'modified', 'permissions'] as const) {
      expect(parseFileNavigatorArgs(`with ${mode}`).details).toBe(mode);
    }
  });

  it('accepts the with clause in either order relative to in and on', () => {
    const first = parseFileNavigatorArgs('with size on left src');
    expect(first).toEqual({ inLabel: undefined, dock: 'left', details: 'size', target: 'src' });

    const second = parseFileNavigatorArgs('in claude on right with modified');
    expect(second).toEqual({ inLabel: 'claude', dock: 'right', details: 'modified', target: '' });
  });

  it('consumes the with clause at most once, leaving a repeat in the target', () => {
    expect(parseFileNavigatorArgs('with size with modified')).toEqual({
      inLabel: undefined, dock: null, details: 'size', target: 'with modified',
    });
  });

  it('leaves an unrecognized mode word in the path target', () => {
    expect(parseFileNavigatorArgs('with foo')).toEqual({
      inLabel: undefined, dock: null, details: undefined, target: 'with foo',
    });
    expect(parseFileNavigatorArgs('with-notes')).toEqual({
      inLabel: undefined, dock: null, details: undefined, target: 'with-notes',
    });
  });

  it('still reaches a directory literally named with through a path form', () => {
    expect(parseFileNavigatorArgs('./with')).toEqual({
      inLabel: undefined, dock: null, details: undefined, target: './with',
    });
  });

  it('keeps the existing in/on/left/right behavior', () => {
    expect(parseFileNavigatorArgs('left')).toEqual({ inLabel: undefined, dock: 'left', details: undefined, target: '' });
    expect(parseFileNavigatorArgs('in claude')).toEqual({ inLabel: 'claude', dock: null, details: undefined, target: '' });
    expect(parseFileNavigatorArgs('./left')).toEqual({ inLabel: undefined, dock: null, details: undefined, target: './left' });
  });
});
