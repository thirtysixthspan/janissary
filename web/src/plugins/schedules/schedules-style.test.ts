import { describe, expect, it } from 'vitest';
import schedules from './schedules.css?raw';

describe('schedules stylesheet', () => {
  it('sizes each column to its content and lets the command column shrink', () => {
    expect(schedules).toContain(
      'grid-template-columns: auto auto auto auto auto minmax(0, auto) auto auto',
    );
    expect(schedules).toContain('grid-template-columns: auto auto auto minmax(0, auto) auto auto');
  });

  it('keeps the headings and the rows on the section grid through subgrid', () => {
    expect(schedules).toContain('.schedules-headings, .schedules-row {');
    expect(schedules).toContain('grid-template-columns: subgrid');
    expect(schedules).toContain('grid-column: 1 / -1');
  });

  it('clips each cell with an ellipsis and keeps its text left-aligned', () => {
    const cell = schedules.match(/\.schedules-headings > span, \.schedules-row > span \{[^}]+\}/)?.[0];

    expect(cell).toBeDefined();
    expect(cell).toContain('min-width: 0');
    expect(cell).toContain('overflow: hidden');
    expect(cell).toContain('white-space: nowrap');
    expect(cell).toContain('text-overflow: ellipsis');
    expect(cell).toContain('text-align: left');
  });

  it('wraps the timing and next-run cells, headings included, instead of clipping them', () => {
    expect(schedules).toContain(
      '.schedules-headings > .schedules-spec, .schedules-headings > .schedules-next,\n'
      + '.schedules-row > .schedules-spec, .schedules-row > .schedules-next { white-space: normal;',
    );
  });

  it('styles the row trash icon with the shared rule', () => {
    expect(schedules).toContain('.schedules-row-icon-button {');
    expect(schedules).not.toContain('.schedules-row-delete {');
    expect(schedules).not.toContain('.schedules-clear');
  });

  it('styles the pause control like the trash icon and mutes paused rows', () => {
    const iconButton = schedules.match(/\.schedules-row-icon-button \{[^}]+\}/)?.[0];

    expect(iconButton).toBeDefined();
    expect(iconButton).toContain('background: transparent');
    expect(iconButton).toContain('border: none');
    expect(iconButton).toContain('color: var(--muted)');
    expect(iconButton).toContain('cursor: pointer');
    expect(iconButton).toContain('font-size: 13px');
    expect(iconButton).toContain('padding: 0 4px');
    expect(iconButton).toContain('line-height: 1');
    expect(iconButton).toContain('justify-self: center');
    expect(schedules).not.toContain('.schedules-row-pause {');
    expect(schedules).toContain('.schedules-row.paused { color: var(--muted); }');
  });

  it('styles the metadata row buttons like the sessions header, and drops the old actions wrapper', () => {
    expect(schedules).toContain('.schedules-header .plugin-actions button {');
    expect(schedules).toContain('.schedules-header .plugin-actions button:hover');
    expect(schedules).not.toContain('.schedules-actions');
  });
});
