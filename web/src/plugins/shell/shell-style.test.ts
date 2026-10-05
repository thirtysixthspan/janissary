import { describe, expect, it } from 'vitest';
import shell from './shell.css?raw';

describe('shell stylesheet', () => {
  it('clips reply decorations to the terminal body', () => {
    const body = shell.match(/\.harness-body\.shell-body \{([^}]*)\}/u)?.[1] ?? '';

    expect(body).toContain('overflow: hidden');
  });
});
