import { describe, expect, it } from 'vitest';
import schedules from './schedules.css?raw';

describe('schedules stylesheet', () => {
  it('sizes the text tracks so they can shrink below their content width', () => {
    expect(schedules).toContain(
      'grid-template-columns: 2em minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) 1.5em',
    );
    expect(schedules).toContain('grid-template-columns: 1.5em minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 1.5em');
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

  it('keeps the headings and the rows on one shared grid', () => {
    expect(schedules).toContain('.schedules-headings, .schedules-row {');
  });

  it('styles the row trash icon the same as the header icon', () => {
    expect(schedules).toContain('.schedules-clear, .schedules-row-delete {');
  });
});
