import { describe, expect, it } from 'vitest';
import theme from '../theme.css?raw';

// The plug's colours are what the status actually says, so they are pinned here rather than left to
// whichever surface happens to render one. The rules live in the host theme because both surfaces —
// a remote tab's metadata row and the sessions tab's State column — render into the same document.
describe('the connection plug', () => {
  it('colours a connection by what it is doing', () => {
    expect(theme).toContain(".connection-plug[data-state='active'] { color: var(--success); }");
    expect(theme).toContain(".connection-plug[data-state='detached'] { color: var(--accent); }");
    expect(theme).toContain(".connection-plug[data-state='ended'] { color: var(--error); }");
  });

  // Neither has settled anywhere yet, so neither takes one of the three answers as its colour.
  it('leaves the unsettled states muted', () => {
    const base = theme.match(/\.connection-plug \{[^}]+\}/)?.[0];

    expect(base).toContain('color: var(--muted)');
    expect(theme).not.toContain(".connection-plug[data-state='provisioning']");
    expect(theme).not.toContain(".connection-plug[data-state='reconnecting']");
  });

  it('leads the metadata row, ahead of the host chip', () => {
    expect(theme).toContain('.tab-meta .connection-plug { order: -2; }');
    expect(theme).toContain('.tab-remote-chip { order: -1;');
  });
});
