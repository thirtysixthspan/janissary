import { describe, expect, it } from 'vitest';
import { basename, dirname } from './rel-path';

describe('relative path helpers', () => {
  it('returns the final component and parent directory', () => {
    expect(basename('src/components/Button.tsx')).toBe('Button.tsx');
    expect(dirname('src/components/Button.tsx')).toBe('src/components');
  });

  it('handles paths without a parent directory', () => {
    expect(basename('README.md')).toBe('README.md');
    expect(dirname('README.md')).toBe('');
  });

  it('keeps the root parent empty', () => {
    expect(dirname('/package.json')).toBe('');
  });
});
