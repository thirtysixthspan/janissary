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

  it('keeps row action buttons light on the dark surface without action colors', () => {
    const buttons = sessions.match(/\.session-row-actions button \{[^}]+\}/)?.[0];

    expect(buttons).toContain('background: transparent');
    expect(buttons).toContain('color: var(--muted)');
    expect(sessions).toContain('.session-row-actions button:hover { color: var(--fg); }');
    expect(sessions).not.toContain("button[data-action='detach']");
    expect(sessions).not.toContain("button[data-action='attach']");
  });

  it('lays the state cell out as its plug and then its word', () => {
    const state = sessions.match(/\.session-row-state \{[^}]+\}/)?.[0];

    expect(state).toContain('display: flex');
    expect(state).toContain('align-items: baseline');
    expect(state).toContain('gap: 6px');
  });

  it('shares a six-column grid between headings and rows', () => {
    expect(sessions).toContain('.session-columns, .session-row {');
    expect(sessions).toContain('grid-template-columns: minmax(0, 1fr) 6em minmax(0, 1.5fr) 8em 8em 6em');
    expect(sessions).toContain('.session-row.joined .session-row-host { padding-left: 16px; }');
    expect(sessions).toContain('padding: 0 12px');
    expect(sessions).toContain('padding: 4px 12px');
  });

  it('left-aligns headings and entries in tracks independent of row action counts', () => {
    const columns = sessions.match(/\.session-columns, \.session-row \{[^}]+\}/)?.[0];
    expect(columns).toContain('text-align: left');
    expect(columns).toContain('font-size: 12px');
    expect(columns).toMatch(/grid-template-columns:[^;]+ 6em;/);
    expect(columns).not.toContain('auto');
  });
});

describe('sessions narrow stylesheet', () => {
  const narrow = sessions.slice(sessions.indexOf('.session-list-narrow'));

  it('scopes every added selector to the narrow list', () => {
    const selectors = [...narrow.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector.startsWith('.session-list-narrow ')).toBe(true);
      expect(selector).not.toContain(',');
    }
    expect(narrow).not.toContain('grid-template-columns');
  });

  it('overrides the grid, no-wrap, and baseline alignment and separates blocks', () => {
    const block = narrow.match(/\.session-list-narrow \.session-row \{[^}]+\}/)?.[0];
    expect(block).toContain('display: block');
    expect(block).toContain('white-space: normal');
    expect(block).toContain('align-items: normal');
    expect(block).toContain('border-bottom: 1px solid var(--border)');
  });

  it('wraps between whole secondary fields and bounds overlong fields with an ellipsis', () => {
    const secondary = narrow.match(/\.session-row-secondary \{[^}]+\}/)?.[0];
    expect(secondary).toContain('display: flex');
    expect(secondary).toContain('flex-wrap: wrap');
    const fields = narrow.match(/\.session-row-secondary > \* \{[^}]+\}/)?.[0];
    expect(fields).toContain('white-space: nowrap');
    expect(fields).toContain('max-width: 100%');
    expect(fields).toContain('min-width: 0');
    expect(fields).toContain('overflow: hidden');
    expect(fields).toContain('text-overflow: ellipsis');
  });

  it('indents the entire joined block without doubling the host indent', () => {
    const joined = narrow.match(/\.session-row\.joined \{[^}]+\}/)?.[0];
    expect(joined).toContain('margin-left: 16px');
    expect(joined).toContain('width: calc(100% - 16px)');
    expect(narrow).toContain('.session-list-narrow .session-row.joined .session-row-host { padding-left: 0; }');
  });

  it('gives the primary name a shrinkable single line beside full-size actions', () => {
    const primary = narrow.match(/\.session-row-primary \{[^}]+\}/)?.[0];
    expect(primary).toContain('display: flex');
    const name = narrow.match(/\.session-row-name \{[^}]+\}/)?.[0];
    expect(name).toContain('flex: 1');
    expect(name).toContain('min-width: 0');
    expect(name).toContain('white-space: nowrap');
    expect(sessions).toContain('.session-row-name { overflow: hidden; text-overflow: ellipsis; }');
    expect(sessions.match(/\.session-row-actions \{[^}]+\}/)?.[0]).toContain('flex-shrink: 0');
  });
});
