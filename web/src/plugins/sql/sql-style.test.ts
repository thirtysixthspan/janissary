import { describe, expect, it } from 'vitest';
import sql from './sql.css?raw';

// The chain of boxes between the tab and the table is the whole of the fix, and none of it is
// visible from a render: jsdom has no layout, so the stylesheet is what has to be read. Each case
// below names one link in the chain, because a link removed anywhere is the same defect — a hundred
// rows painting over the command bar.

const rule = (selector: string): string =>
  sql.match(new RegExp(`(?:^|[},])\\s*\\${selector} \\{[^}]+\\}`, 'm'))?.[0] ?? '';

describe('the sql stylesheet', () => {
  // The tab is a column of three: the metadata row, the grid, and the bar. It has to bound its own
  // height, or the grid below it is laid out against a box that never ends.
  it('bounds the tab it is all inside', () => {
    const tab = rule('.sql-tab');

    expect(tab).toContain('flex: 1');
    expect(tab).toContain('min-height: 0');
    expect(tab).toContain('display: flex');
    expect(tab).toContain('flex-direction: column');
  });

  // One metadata row above one body: the band is the width of the tab, the actions sit at its right
  // end, and the grid below it is what takes the remaining height.
  it('is one metadata row above the grid, with the actions at the right end', () => {
    const meta = rule('.sql-meta');
    const actions = rule('.sql-meta-actions');

    expect(meta).toContain('display: flex');
    expect(meta).toContain('border-bottom: 1px solid var(--border)');
    expect(actions).toContain('margin-left: auto');
  });

  // Only meaningful because the tab above is a flex column; without that, `flex: 1` on the grid area
  // is a declaration about nothing.
  it('lets the grid take the height between the row and the bar', () => {
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

  // The three removed surfaces must not leave their rules behind: a stylesheet entry for a control
  // that no longer exists is how the next reader is misled about what this tab offers.
  it('carries no rule for a control the tab no longer has', () => {
    for (const gone of ['.sql-header', '.sql-nav-row', '.sql-stats', '.sql-switch', '.sql-grid-pane']) {
      expect(sql).not.toContain(`${gone} {`);
    }
  });
});
