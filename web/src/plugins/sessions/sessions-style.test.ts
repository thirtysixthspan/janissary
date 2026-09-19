import { describe, expect, it } from 'vitest';
import sessions from './sessions.css?raw';

describe('sessions stylesheet', () => {
  // Without this rule the header's buttons arrive with the browser's default chrome and the refresh
  // icon reads bright against the dark header; the conversation list styles its own the same way.
  it('gives the metadata-row buttons the muted icon treatment', () => {
    const buttons = sessions.match(
      /\.session-list-header \.plugin-actions button \{[^}]+\}/,
    )?.[0];

    expect(buttons).toBeDefined();
    expect(buttons).toContain('background: transparent');
    expect(buttons).toContain('border: none');
    expect(buttons).toContain('color: var(--muted)');
    expect(sessions).toContain('.session-list-header .plugin-actions button:hover { color: var(--fg); }');
  });
});
