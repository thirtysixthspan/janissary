import { describe, expect, it } from 'vitest';
import { revealRow, revealScrollTop } from './reveal-row';

// The band a row has to land in starts under the sticky header, not at the frame's top edge. These
// frames are 100px from the top of the page, 300px tall, with a 30px header — so the band runs from
// 130 to 400, in the client coordinates `getBoundingClientRect` answers in.

const band = { top: 130, bottom: 400, scrollTop: 500 };

describe('revealScrollTop', () => {
  it('scrolls up by exactly what the header is covering', () => {
    expect(revealScrollTop(band, { top: 110, bottom: 130 })).toBe(480);
  });

  it('scrolls down by exactly what the frame bottom is cutting off', () => {
    expect(revealScrollTop(band, { top: 395, bottom: 415 })).toBe(515);
  });

  it('leaves a row that is already in the band where it is', () => {
    expect(revealScrollTop(band, { top: 130, bottom: 150 })).toBeNull();
    expect(revealScrollTop(band, { top: 380, bottom: 400 })).toBeNull();
  });

  it('shows the top of a row taller than the band rather than its bottom', () => {
    expect(revealScrollTop(band, { top: 200, bottom: 600 })).toBe(570);
  });

  it('never asks for a scroll above the top of the table', () => {
    expect(revealScrollTop({ ...band, scrollTop: 10 }, { top: 50, bottom: 70 })).toBe(0);
  });
});

/** A frame whose layout is stubbed, because jsdom has none. */
function frameWith(header: number, scrollTop: number) {
  const frame = document.createElement('div');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  tbody.append(row);
  table.append(thead, tbody);
  frame.append(table);
  frame.getBoundingClientRect = () => ({ top: 100, bottom: 400 }) as DOMRect;
  thead.getBoundingClientRect = () => ({ height: header }) as DOMRect;
  Object.defineProperty(frame, 'clientHeight', { value: 300 });
  frame.scrollTop = scrollTop;
  return { frame, row };
}

describe('revealRow', () => {
  // The header holds the filter row when one is open, so the header's height is measured from the
  // `thead` each time rather than taken as one row's worth.
  it('measures the band from the header the frame has now', () => {
    const { frame, row } = frameWith(60, 500);
    row.getBoundingClientRect = () => ({ top: 140, bottom: 160 }) as DOMRect;
    revealRow(frame, row, false);
    expect(frame.scrollTop).toBe(480);
  });

  it('does not move a frame whose row is already below the header', () => {
    const { frame, row } = frameWith(30, 500);
    row.getBoundingClientRect = () => ({ top: 140, bottom: 160 }) as DOMRect;
    revealRow(frame, row, false);
    expect(frame.scrollTop).toBe(500);
  });

  // The first row is the top of the table, so reaching it is the whole way back, not near it.
  it('takes the frame all the way back to the top for the first row', () => {
    const { frame, row } = frameWith(30, 12);
    row.getBoundingClientRect = () => ({ top: 130, bottom: 150 }) as DOMRect;
    revealRow(frame, row, true);
    expect(frame.scrollTop).toBe(0);
  });
});
