import { describe, expect, it } from 'vitest';
import chat from './chat.css?raw';
import theme from '../../theme.css?raw';

function rule(selector: string): string | undefined {
  return chat.split('\n').find((line) => line.startsWith(`${selector} {`));
}

describe('conversation list metadata row', () => {
  it('drops the padded plugin frame so the row spans the full width', () => {
    const frame = rule('.chat-list.plugin-tab');

    expect(frame).toContain('padding: 0');
    expect(frame).toContain('gap: 0');
  });

  it('carries the padding, type size, and rule of the host metadata rows', () => {
    const header = rule('.chat-list-header');

    expect(header).toContain('padding: 6px 12px');
    expect(header).toContain('font-size: 12px');
    expect(header).toContain('border-bottom: 1px solid var(--border)');
  });

  it('gives both chat metadata rows the host icon-button treatment', () => {
    const buttons = chat.match(
      /\.chat-list-header \.plugin-actions button, \.chat-header \.plugin-actions button \{[^}]+\}/,
    )?.[0];

    expect(buttons).toBeDefined();
    expect(buttons).toContain('background: transparent');
    expect(buttons).toContain('border: none');
    expect(buttons).toContain('color: var(--muted)');
    expect(chat).toContain('.chat-header .plugin-actions button:hover { color: var(--fg); }');
    expect(chat).toContain('opacity: 0.45');
  });
});

describe('chat stylesheet tokens', () => {
  it('names only custom properties the application theme defines', () => {
    const referenced = [...chat.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]);
    const tokens = new Set(referenced);

    expect(referenced.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(theme, `${token} is referenced by chat.css`).toContain(`${token}:`);
    }
  });
});
