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

  it('gives a connection tab the list header\'s band and muted icon buttons, dimmed while disabled', () => {
    const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
    const band = styles.match(/\.connections-record-header, \.connections-list-header \{[^}]+\}/)?.[0];
    expect(band).toContain('min-height: 28px');
    expect(band).toContain('padding: 6px 12px');
    expect(band).toContain('border-bottom: 1px solid var(--border)');
    const buttons = styles.match(
      /\.connections-record-header \.plugin-actions button, \.connections-list-header \.plugin-actions button \{[^}]+\}/,
    )?.[0];
    expect(buttons).toContain('background: transparent');
    expect(buttons).toContain('border: none');
    expect(buttons).toContain('color: var(--muted)');
    expect(styles).toContain('.connections-record-header .plugin-actions button:hover,');
    const disabled = styles.match(/\.connections-record-header \.plugin-actions button:disabled \{[^}]+\}/)?.[0];
    expect(disabled).toContain('opacity: 0.45');
    expect(styles).not.toContain('.connections-record-title');
  });

  it('lays the heading row and the rows out on one shared grid', () => {
    const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
    expect(styles).toMatch(/\.connections-columns, \.connections-row \{[^}]*grid-template-columns:/);
    expect(styles).toContain('.connections-row-actions button');
  });
});

describe('connections rows follow the sessions rows', () => {
  const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
  const rule = (selector: string) => {
    const start = styles.indexOf(`\n${selector} {`);
    return start === -1 ? undefined : styles.slice(start + 1, styles.indexOf('}', start) + 1);
  };

  it('scrolls the whole list as one flex column without a focus ring', () => {
    const list = rule('.connections-list');
    expect(list).toContain('flex: 1');
    expect(list).toContain('min-height: 0');
    expect(list).toContain('overflow-y: auto');
    expect(list).toContain('flex-direction: column');
    expect(list).toContain('outline: none');
    expect(rule('.connections-rows')).toBe('.connections-rows { display: flex; flex-direction: column; }');
  });

  it('shares baseline alignment, 12px padding, and 12px text between headings and rows', () => {
    const grid = rule('.connections-columns, .connections-row');
    expect(grid).toContain('align-items: baseline');
    expect(grid).toContain('padding: 0 12px');
    expect(grid).toContain('font-size: 12px');
    expect(grid).toContain('text-align: left');
    expect(grid).not.toContain('align-items: center');
  });

  it('gives the connection id its own muted, ellipsized track before the name', () => {
    const grid = rule('.connections-columns, .connections-row');
    const tracks = grid?.match(/grid-template-columns: ([^;]+);/)?.[1];
    expect(tracks).toBe('minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) 8em 8em 4em');
    const ellipsized = rule('.connections-row-host, .connections-row-owner, .connections-row-id, .connections-row-title');
    expect(ellipsized).toContain('text-overflow: ellipsis');
    expect(ellipsized).toContain('white-space: nowrap');
    expect(styles).toContain(
      '.connections-row-host, .connections-row-owner, .connections-row-id, .connections-row-status { color: var(--muted); }',
    );
  });

  it('draws full-bleed rows with distinct hover and selection shades', () => {
    const row = rule('.connections-row');
    expect(row).toContain('padding: 4px 12px');
    expect(row).toContain('white-space: nowrap');
    expect(row).toContain('color: var(--fg)');
    expect(styles).not.toContain('border-radius: 4px; cursor: pointer');
    expect(styles).not.toContain('border-left-color: var(--accent)');
    expect(styles).toContain('.connections-row:hover { background: var(--border); }');
    expect(styles).toContain('.connections-row.selected { background: var(--bg-soft); }');
    expect(rule('.connections-row-actions')).toContain('flex-shrink: 0');
  });

  it('colours an idle row like a parked session and mutes rows that are over', () => {
    expect(styles).toContain(".connections-row[data-status='Idle'] .connections-row-status { color: var(--accent); }");
    const ended = styles.match(/\.connections-row\[data-status='Closed'\],[^{]+\{[^}]+\}/)?.[0];
    for (const status of ['Closed', 'Completed', 'Failed', 'Terminated']) {
      expect(ended).toContain(`.connections-row[data-status='${status}']`);
    }
    expect(ended).toContain('color: var(--muted)');
    expect(styles).not.toContain("[data-status='Running']");
    expect(styles).not.toContain("[data-status='Open']");
  });
});

describe('connections narrow stylesheet', () => {
  const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
  const narrow = styles.slice(styles.indexOf('.connections-list-narrow'));

  it('scopes every added selector to the narrow list', () => {
    const selectors = [...narrow.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector.startsWith('.connections-list-narrow ')).toBe(true);
      expect(selector).not.toContain(',');
    }
    expect(narrow).not.toContain('grid-template-columns');
  });

  it('overrides the grid, no-wrap, and baseline alignment and separates blocks', () => {
    const block = narrow.match(/\.connections-list-narrow \.connections-row \{[^}]+\}/)?.[0];
    expect(block).toContain('display: block');
    expect(block).toContain('white-space: normal');
    expect(block).toContain('align-items: normal');
    expect(block).toContain('border-bottom: 1px solid var(--border)');
  });

  it('wraps between whole secondary fields and bounds overlong fields with an ellipsis', () => {
    const secondary = narrow.match(/\.connections-row-secondary \{[^}]+\}/)?.[0];
    expect(secondary).toContain('display: flex');
    expect(secondary).toContain('flex-wrap: wrap');
    const fields = narrow.match(/\.connections-row-secondary > \* \{[^}]+\}/)?.[0];
    expect(fields).toContain('white-space: nowrap');
    expect(fields).toContain('max-width: 100%');
    expect(fields).toContain('min-width: 0');
    expect(fields).toContain('overflow: hidden');
    expect(fields).toContain('text-overflow: ellipsis');
  });

  it('gives the name a shrinkable single line beside the actions', () => {
    expect(narrow.match(/\.connections-row-primary \{[^}]+\}/)?.[0]).toContain('display: flex');
    const name = narrow.match(/\.connections-row-title \{[^}]+\}/)?.[0];
    expect(name).toContain('flex: 1');
    expect(name).toContain('min-width: 0');
    expect(name).toContain('white-space: nowrap');
  });
});
