import { describe, expect, it } from 'vitest';
import conversations from './conversations.css?raw';
import theme from '../../theme.css?raw';

function rule(selector: string): string | undefined {
  return conversations.split('\n').find((line) => line.startsWith(`${selector} {`));
}

describe('conversation list metadata row', () => {
  it('drops the padded plugin frame so the row spans the full width', () => {
    const frame = rule('.conversation-list.plugin-tab');

    expect(frame).toContain('padding: 0');
    expect(frame).toContain('gap: 0');
  });

  it('carries the padding, type size, and rule of the host metadata rows', () => {
    const header = rule('.conversation-list-header');

    expect(header).toContain('padding: 6px 12px');
    expect(header).toContain('font-size: 12px');
    expect(header).toContain('border-bottom: 1px solid var(--border)');
  });

  it('gives both conversation metadata rows the host icon-button treatment', () => {
    const buttons = conversations.match(
      /\.conversation-list-header \.plugin-actions button, \.conversation-header \.plugin-actions button \{[^}]+\}/,
    )?.[0];

    expect(buttons).toBeDefined();
    expect(buttons).toContain('background: transparent');
    expect(buttons).toContain('border: none');
    expect(buttons).toContain('color: var(--muted)');
    expect(conversations).toContain('.conversation-header .plugin-actions button:hover { color: var(--fg); }');
    expect(conversations).toContain('opacity: 0.45');
  });
});

describe('conversation tab frame', () => {
  // The command bar the tab ends with is a full-width band with a rule along its top. Inset by the
  // plugin frame's padding it reads as a floating box instead, so the frame gives the padding up and
  // the regions above the bar take it back.
  it('drops the padded plugin frame so the command bar spans the full width', () => {
    const frame = rule('.conversation-tab.plugin-tab');

    expect(frame).toContain('padding: 0');
    expect(frame).toContain('gap: 0');
  });

  it('gives the padding back to the regions above the command bar', () => {
    expect(rule('.conversation-header')).toContain('padding: 8px 12px 0');
    expect(rule('.conversation-turns')).toContain('padding: 8px 12px');
    expect(rule('.conversation-deleted')).toContain('padding: 0 12px 8px');
  });

  // The bar is the host's own component rendering host-styled classes, so a rule here would be a
  // second definition of something theme.css already owns.
  it('leaves the command bar styling to the application theme', () => {
    expect(conversations).not.toContain('.command');
    expect(theme).toContain('.command-area {');
  });
});

describe('conversation list rows', () => {
  it('marks the current row differently from a hovered row', () => {
    const hovered = rule('.conversation-row:hover');
    const current = rule('.conversation-row.selected');

    expect(hovered).toContain('background: var(--bg-soft)');
    expect(hovered).not.toContain('border-left-color');
    expect(current).toContain('border-left-color: var(--accent)');
  });

  it('leaves the focused list without an outline of its own', () => {
    expect(rule('.conversation-list')).toContain('outline: none');
  });
});

describe('conversations stylesheet tokens', () => {
  it('names only custom properties the application theme defines', () => {
    const referenced = [...conversations.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]);
    const tokens = new Set(referenced);

    expect(referenced.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(theme, `${token} is referenced by conversations.css`).toContain(`${token}:`);
    }
  });
});
