import { describe, expect, it } from 'vitest';
import search from './search.css?raw';
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

  it('leaves the match line itself uncapped however long it wraps', () => {
    // A wrapped match is the code the user opened the row to read, so the two-display-line cap
    // applies to the context and to nothing else.
    const hit = rule('.search-hit');

    expect(hit).toContain('color: var(--fg)');
    expect(hit).not.toContain('max-height');
    expect(hit).not.toContain('overflow');
  });
});

describe('search control placement', () => {
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
});
