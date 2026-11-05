import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('connections list styles', () => {
  it('loads shared and feature styles from the lazy entry and scopes list selectors', () => {
    const entry = readFileSync('web/src/plugins/connections/index.tsx', 'utf8');
    const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');

    expect(entry).toContain("import '../shared.css';");
    expect(entry).toContain("import './connections.css';");
    expect(styles).toContain('.connections-list.plugin-tab');
    expect(styles).toContain('.connections-row.selected');
    expect(styles).toContain('.connections-record-header');
    expect(styles).toContain('.connections-history {');
    expect(styles).toContain('.connections-activity');
    expect(styles).not.toContain('.conversation-');
  });

  it('gives the metadata row the sessions band and muted icon buttons', () => {
    const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
    const band = styles.match(/\.connections-list-header \{[^}]+\}/)?.[0];
    expect(band).toContain('min-height: 28px');
    expect(band).toContain('padding: 6px 12px');
    expect(band).toContain('border-bottom: 1px solid var(--border)');
    const buttons = styles.match(/\.connections-list-header \.plugin-actions button \{[^}]+\}/)?.[0];
    expect(buttons).toContain('background: transparent');
    expect(buttons).toContain('border: none');
    expect(buttons).toContain('color: var(--muted)');
    expect(styles).toContain('.connections-list-header .plugin-actions button:hover { color: var(--fg); }');
  });

  it('lays the heading row and the rows out on one shared grid', () => {
    const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
    expect(styles).toMatch(/\.connections-columns, \.connections-row \{[^}]*grid-template-columns:/);
    expect(styles).toContain('.connections-row-actions button');
  });
});
