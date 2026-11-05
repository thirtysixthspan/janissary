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

  it('lays the heading row and the rows out on one shared grid', () => {
    const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
    expect(styles).toMatch(/\.connections-columns, \.connections-row \{[^}]*grid-template-columns:/);
    expect(styles).toContain('.connections-row-actions button');
  });
});
