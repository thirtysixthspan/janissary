import { describe, expect, it } from 'vitest';
import search from './search.css?raw';
import entry from './index?raw';
import shared from '../shared.css?raw';
import theme from '../../theme.css?raw';

// The context either side of a match is bounded by a stylesheet rule, and jsdom lays nothing out —
// so this file is what stands between a change to that cap and the screen. The selectors and the
// declarations are pinned individually because the rule is the behaviour: the cap, and which end of
// each block is clipped.
const rule = (selector: string): string => {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const found = search.match(new RegExp(String.raw`^${escaped} \{([^}]*)\}`, 'mu'));
  expect(found, `no rule for ${selector}`).toBeTruthy();
  return found?.[1] ?? '';
};

describe('search stylesheet', () => {
  it('bounds the context either side of a match to two display lines', () => {
    const block = rule('.search-context-block');

    expect(block).toContain('max-height: 3em');
    expect(block).toContain('overflow: hidden');
    // 3em is two line boxes only because the row they are counted in is 12px at 1.5. Pin both, so
    // a font-size or line-height change that quietly made the cap three lines fails here instead.
    const row = rule('.search-row');
    expect(row).toContain('font-size: 12px');
    expect(row).toContain('line-height: 1.5');
  });

  it('clips the block above the match at the top, so the lines nearest the match survive', () => {
    const above = rule('.search-context-above');

    // Packed to the end, the block overflows off its start — the top — and the match's own adjacent
    // lines are the ones left standing.
    expect(above).toContain('justify-content: flex-end');
  });

  it('clips the block below the match at the bottom, on the default packing', () => {
    // The below block packs to the start, which is what a column flex does with nothing said, so
    // there is deliberately no rule overriding it: adding one would clip the wrong end.
    expect(search).not.toContain('.search-context-below {');
    expect(rule('.search-context-block')).toContain('flex-direction: column');
  });

  it('draws a divider between two consecutive results', () => {
    // A reversed column puts a row's DOM predecessor directly beneath it, so the bottom edge of every
    // row after the first is the line between the two.
    expect(rule('.search-row + .search-row')).toContain('border-bottom: 1px solid var(--border)');
  });

  it('leaves the first result and a lone result undivided', () => {
    const row = rule('.search-row');

    expect(row).not.toContain('border-bottom');
    expect(row).not.toContain('border-top');
  });

  it('leaves the match line’s height to the window the row measures', () => {
    // A fixed stylesheet height would cut a long match line at its start, wherever the match sat in
    // it. The row caps it inline at the display lines around the match instead, so the stylesheet
    // sets no height on the line at all.
    const hit = rule('.search-hit');

    expect(hit).toContain('color: var(--fg)');
    expect(hit).not.toContain('max-height');
    expect(rule('.search-hit-text')).not.toContain('max-height');
  });

  it('clips the match line to its inline cap and lets its text shift to the match', () => {
    // The cap is inline, so the rule only has to clip whatever overflows it; the text inside is a
    // block so the row can move it up to the first display line it shows.
    expect(rule('.search-hit-text')).toContain('overflow: hidden');
    expect(rule('.search-hit-block')).toContain('display: block');
  });
});

describe('search control placement', () => {
  it('loads the shared plugin frame when search is the first plugin opened', () => {
    // Without the shared sheet the metadata bar is a plain block, and the split icon wraps onto a
    // second line at the left edge instead of sitting at the right end of the fields' line.
    expect(entry).toContain("import '../shared.css'");
    expect(entry.indexOf("import '../shared.css'")).toBeLessThan(entry.indexOf("import './search.css'"));
    expect(shared).toMatch(/\.plugin-meta \{[^}]*display: flex/);
    expect(shared).toMatch(/\.plugin-actions \{[^}]*margin-left: auto/);
  });

  it('lets the command line pin a trailing control to its right', () => {
    // The shell's own rule, not the plugin's: a plugin that has to reach into the command line's
    // layout to place a control on it is the drift the trailing slot exists to prevent.
    expect(theme).toMatch(/\.command \.command-trailing \{[^}]*margin-left: auto/);
    expect(theme).toMatch(/\.command \.command-trailing \{[^}]*flex-shrink: 0/);
  });

  it('sizes the modifiers as command line chrome, sharing the line’s own font', () => {
    const button = rule('.search-toggles button');

    // No padding of its own and the line's own size: a row of 12px buttons under a 13px caret reads
    // as a separate band rather than as part of the line the modifiers qualify.
    expect(button).toContain('font-family: inherit');
    expect(button).toContain('font-size: 13.1625px');
    expect(button).toContain('padding: 0 6px');
  });

  it('gives the filter fields the room the metadata bar leaves beside the tab actions', () => {
    const filters = rule('.search-filters');

    // `flex: 1` and `min-width: 0` together, because `.plugin-meta` wraps: without both the fields
    // claim their intrinsic width, overflow the narrow pane, and push the actions off the line.
    expect(filters).toContain('flex: 1');
    expect(filters).toContain('min-width: 0');
  });

  it('stacks the result window upward, first match at the bottom edge', () => {
    const results = rule('.search-results');

    // A reversed column, so the first row the scan produced sits at the bottom and each later row
    // above it — which is also where a reversed column puts its scroll origin, so the window opens
    // on the first match and stays there while rows stream in above it.
    expect(results).toContain('display: flex');
    expect(results).toContain('flex-direction: column-reverse');
  });

  it('keeps the result window scrollable and shrinkable', () => {
    const results = rule('.search-results');

    // Reversing the column changes which end it grows from and nothing else: a window that stopped
    // scrolling, or that refused to shrink inside the tab's column, would look like a search that
    // had stopped updating.
    expect(results).toContain('overflow-y: auto');
    expect(results).toContain('min-height: 0');
    expect(results).toContain('flex: 1');
  });

  it('bounds the result window inside the shared plugin frame', () => {
    // `flex: 1` and `min-height: 0` only cap the window when its parent is a flex column; without the
    // shared frame the window grew to its content and pushed the command line off the screen.
    const frame = shared.match(/\.plugin-tab \{([^}]*)\}/u)?.[1] ?? '';
    expect(frame).toContain('display: flex');
    expect(frame).toContain('flex-direction: column');
    expect(frame).toContain('min-height: 0');
  });

  it('frames the result window with the filter fields’ hairline', () => {
    const results = rule('.search-results');

    expect(results).toContain('border: 1px solid var(--border)');
    expect(results).toContain('border-radius: 3px');
  });

  it('marks keyboard focus on the result window’s frame', () => {
    // The window hides the browser's outline, so its frame is where focus shows.
    expect(rule('.search-results:focus-visible')).toContain('border-color: var(--accent)');
  });
});
