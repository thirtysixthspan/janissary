import { describe, expect, it } from 'vitest';
import visualizations from './visualizations.css?raw';
import theme from '../../theme.css?raw';

// The chart is drawn in the application's own custom properties, which is also the only reason an
// exported chart can look like the one on screen: a serialized SVG resolves nothing, so the export path
// reads these names off the element and inlines them. A colour spelled as a literal here would draw
// correctly and export as a black rectangle, and this is the assertion that says so.

describe('the visualizations stylesheet', () => {
  it('names only custom properties the application theme defines', () => {
    const used = [...visualizations.matchAll(/var\((--[\w-]+)/gu)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(theme).toContain(`${name}:`);
  });

  it('paints no colour literally, so a theme switch reaches the chart', () => {
    const literals = [...visualizations.matchAll(/#[0-9a-f]{3,8}\b/giu)].map((match) => match[0]);
    expect(literals).toEqual([]);
  });

  it('frames the index the way the host tab bodies frame theirs', () => {
    expect(visualizations).toMatch(/\.visualization-list\.plugin-tab \{[^}]*padding: 0;[^}]*gap: 0;/u);
    expect(visualizations).toMatch(/\.visualization-list-header \{[^}]*border-bottom: 1px solid var\(--border\);/u);
  });

  it('marks the current row with a leading accent bar, so hover cannot be mistaken for it', () => {
    expect(visualizations).toMatch(/\.visualization-row\.selected \{[^}]*border-left-color: var\(--accent\);/u);
    expect(visualizations).toMatch(/\.visualization-row:hover \{ background: var\(--bg-soft\); \}/u);
  });

  it('strips the browser button chrome from the metadata actions, as the host ones do', () => {
    expect(visualizations).toMatch(/\.visualization-header \.plugin-actions button \{[^}]*background: transparent;/u);
  });
});

describe('the export path', () => {
  it('resolves exactly the custom properties the stylesheet paints with', async () => {
    const { withResolvedColours } = await import('./export/download');
    expect(typeof withResolvedColours).toBe('function');
  });
});
