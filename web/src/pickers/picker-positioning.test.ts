import { describe, expect, it } from 'vitest';
import theme from '../theme.css?raw';

function declarations(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const match = theme.match(new RegExp(String.raw`^${escaped} \{([^}]*)\}`, 'mu'));
  expect(match, `missing CSS rule for ${selector}`).toBeTruthy();
  return match?.[1] ?? '';
}

describe('picker positioning', () => {
  it('seats plugin popups on the command bar and flush beside the colored edge', () => {
    expect(declarations('.tab-body')).toContain('position: relative');
    const popup = declarations('.tab-body > .picker');

    expect(popup).toContain('left: 0');
    expect(popup).toContain('bottom: var(--command-bar-height, 0)');
    expect(popup).toContain('right: 0');
  });

  it('keeps agent popups anchored to the main transcript area', () => {
    expect(declarations('.picker')).toContain('bottom: 0');
    expect(declarations('.main')).toContain('position: relative');
  });
});
