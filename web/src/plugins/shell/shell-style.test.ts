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

  it('allows selecting text in rendered shell replies', () => {
    const reply = shell.match(/\.shell-output-block \{([^}]*)\}/u)?.[1] ?? '';

    expect(reply).toContain('user-select: text');
  });

  it('draws the thinking marker muted, plain, and clickable over the terminal', () => {
    const marker = shell.match(/\.shell-thinking-marker \{([^}]*)\}/u)?.[1] ?? '';

    expect(marker).toContain('color: var(--muted)');
    expect(marker).toContain('font-weight: normal');
    expect(marker).toContain('cursor: pointer');
    expect(marker).toContain('white-space: nowrap');
    expect(marker).toContain('pointer-events: auto');
    expect(marker).not.toContain('line-height');
  });

  it('draws the settled thinking marker as an accent-coloured underlined link', () => {
    const link = shell.match(/\.shell-thinking-marker\[data-kind='link'\] \{([^}]*)\}/u)?.[1] ?? '';

    expect(link).toContain('color: var(--accent)');
    expect(link).toContain('text-decoration: underline');
  });
});
