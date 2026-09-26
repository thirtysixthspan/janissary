import { describe, it, expect } from 'vitest';
import { fileActivation } from './activation';

describe('fileActivation', () => {
  it('asks for the edit gesture on a plain activation of a markdown file', () => {
    expect(fileActivation('README.md', false)).toBe(true);
    expect(fileActivation('docs/guide.markdown', false)).toBe(true);
  });

  it('asks for the plain open on a shifted activation of a markdown file', () => {
    expect(fileActivation('README.md', true)).toBe(false);
  });

  it('matches the markdown extension whatever its case', () => {
    expect(fileActivation('NOTES.MD', false)).toBe(true);
  });

  it('asks for the plain open on a plain activation of any other file', () => {
    expect(fileActivation('src/index.ts', false)).toBe(false);
    expect(fileActivation('clip.mp4', false)).toBe(false);
  });

  it('asks for the edit gesture on a shifted activation of any other file', () => {
    expect(fileActivation('src/index.ts', true)).toBe(true);
  });

  it('leaves a name that merely contains a markdown extension alone', () => {
    expect(fileActivation('notes.md.txt', false)).toBe(false);
  });
});
