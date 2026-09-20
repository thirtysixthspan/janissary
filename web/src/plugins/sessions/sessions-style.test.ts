import { describe, expect, it } from 'vitest';
import sessions from './sessions.css?raw';

describe('sessions stylesheet', () => {
  it('uses a full-width metadata band with right-aligned actions', () => {
    expect(sessions).toContain('.session-list.plugin-tab { padding: 0; gap: 0; }');
    expect(sessions).toContain('padding: 6px 12px');
    expect(sessions).toContain('border-bottom: 1px solid var(--border)');
    expect(sessions).toContain('.session-list-header { min-height: 28px;');
  });

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

  it('colors the row link buttons by what pressing them would do', () => {
    expect(sessions)
      .toContain(".session-row-actions button[data-action='detach'] { color: var(--success); }");
    expect(sessions)
      .toContain(".session-row-actions button[data-action='reattach'] { color: var(--error); }");
  });
});
