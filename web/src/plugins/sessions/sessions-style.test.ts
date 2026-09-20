import { describe, expect, it } from 'vitest';
import sessions from './sessions.css?raw';
import entry from './index?raw';
import shared from '../shared.css?raw';

describe('sessions stylesheet', () => {
  it('loads the shared metadata layout when sessions is the first plugin opened', () => {
    expect(entry).toContain("import '../shared.css'");
    expect(shared).toMatch(/\.plugin-meta \{[^}]*display: flex/);
    expect(shared).toMatch(/\.plugin-actions \{[^}]*margin-left: auto/);
  });

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

  it('shares a six-column grid between headings and rows', () => {
    expect(sessions).toContain('.session-columns, .session-row {');
    expect(sessions).toContain('grid-template-columns: minmax(0, 1fr) 6em minmax(0, 1.5fr) 8em 8em 6em');
    expect(sessions).toContain('.session-row.joined .session-row-host { padding-left: 16px; }');
  });

  it('left-aligns headings and entries in tracks independent of row action counts', () => {
    const columns = sessions.match(/\.session-columns, \.session-row \{[^}]+\}/)?.[0];
    expect(columns).toContain('text-align: left');
    expect(columns).toContain('font-size: 12px');
    expect(columns).toMatch(/grid-template-columns:[^;]+ 6em;/);
    expect(columns).not.toContain('auto');
  });
});
