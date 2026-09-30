import { describe, expect, it } from 'vitest';
import sql from './sql.css?raw';

// The chain of boxes between the tab and the table is the whole of the fix, and none of it is
// visible from a render: jsdom has no layout, so the stylesheet is what has to be read. Each case
// below names one link in the chain, because a link removed anywhere is the same defect — a hundred
// rows painting over the command bar.

// A block whose selector list is exactly this one. The `}` or `,` in front of it is what keeps a
// compound selector such as `.sql-docked .sql-grid-area` from answering for a bare `.sql-grid-area`.
const rule = (selector: string): string =>
  sql.match(new RegExp(`(?:^|[},])\\s*\\${selector} \\{[^}]+\\}`, 'm'))?.[0] ?? '';

describe('the sql stylesheet', () => {
  // The grid sits in a pane beside the navigator, and that pane is the box the tab's height has to
  // reach. It was a content-sized block, so the bounded grid below it was never bounded at all.
  it('bounds the pane the grid sits in, and makes it a flex container', () => {
    const pane = rule('.sql-grid-pane');

    expect(pane).toContain('flex: 1');
    expect(pane).toContain('min-width: 0');
    expect(pane).toContain('min-height: 0');
    expect(pane).toContain('display: flex');
  });

  // Only meaningful because the pane above is a flex container; without that, `flex: 1` on the grid
  // area is a declaration about nothing.
  it('lets the grid area take that height rather than the height of its rows', () => {
    const area = rule('.sql-grid-area');

    expect(area).toContain('flex: 1');
    expect(area).toContain('min-height: 0');
    expect(area).toContain('min-width: 0');
  });

  // The one element between the table and the command bar. If it stops scrolling, the table does
  // something else, and there is nothing else in between for it to do.
  it('scrolls the table inside that frame', () => {
    const scroll = rule('.sql-grid-scroll');

    expect(scroll).toContain('flex: 1');
    expect(scroll).toContain('min-height: 0');
    expect(scroll).toContain('overflow: auto');
  });

  // The command bar is the fixed half. It is what the table must not be laid out against, so it is
  // not allowed to give way when the table is tall.
  it('never lets the table squeeze the command bar', () => {
    expect(rule('.sql-console')).toContain('flex-shrink: 0');
  });
});
