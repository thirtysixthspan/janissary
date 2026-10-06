import { describe, expect, it } from 'vitest';
import shell from './shell.css?raw';

describe('shell stylesheet', () => {
  it('clips reply decorations to the terminal body', () => {
    const body = shell.match(/\.harness-body\.shell-body \{([^}]*)\}/u)?.[1] ?? '';

    expect(body).toContain('overflow: hidden');
  });

  it('paints the padding beside the terminal text in the theme background', () => {
    const viewport = shell.match(/\.shell-body \.xterm \.xterm-viewport \{([^}]*)\}/u)?.[1] ?? '';

    expect(viewport).toContain('background-color: var(--bg)');
  });
});
