import { describe, expect, it } from 'vitest';
import theme from '../theme.css?raw';

function declarations(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const match = theme.match(new RegExp(String.raw`^${escaped} \{([^}]*)\}`, 'mu'));
  expect(match, `missing CSS rule for ${selector}`).toBeTruthy();
  return match?.[1] ?? '';
}

describe('picker positioning', () => {
  it('anchors plugin popups to the tab body above the command bar and past its colored edge', () => {
    expect(declarations('.tab-body')).toContain('position: relative');
    const popup = declarations('.tab-body > .picker');

    expect(popup).toContain('left: 8px');
    expect(popup).toContain('bottom: 40px');
    expect(popup).toContain('right: 0');
  });

  it('keeps agent popups anchored to the main transcript area', () => {
    expect(declarations('.picker')).toContain('bottom: 0');
    expect(declarations('.main')).toContain('position: relative');
  });
});
