import { describe, expect, it } from 'vitest';
import { fileActivation } from './file-activation';

describe('fileActivation', () => {
  it('asks for the open route by default and the edit route with Shift', () => {
    expect(fileActivation('src/index.ts', false)).toBe(false);
    expect(fileActivation('src/index.ts', true)).toBe(true);
  });

  it('inverts both for a Markdown file, whatever the extension case', () => {
    expect(fileActivation('README.md', false)).toBe(true);
    expect(fileActivation('README.md', true)).toBe(false);
    expect(fileActivation('docs/Guide.MARKDOWN', false)).toBe(true);
  });
});
