// The xterm selection bridge, read by the default context menu.
//
// A terminal's selection is emulator state, not a DOM selection, so `globalThis.getSelection()`
// finds nothing and the menu cannot know what the right-click landed on without help. A surface
// running a terminal registers the terminal against the element it renders into, and resolution
// answers that terminal's selection when the click falls inside it.
type TerminalAccess = {
  hasSelection: () => boolean;
  getSelection: () => string;
};

const terminals = new Map<HTMLDivElement, TerminalAccess>();

// Registration is one terminal per surface: every terminal mounts through `useXterm`, which
// registers exactly once and removes it on teardown.
export function registerTerminalSelection(container: HTMLDivElement, access: TerminalAccess): void {
  terminals.set(container, access);
}

export function unregisterTerminalSelection(container: HTMLDivElement): void {
  terminals.delete(container);
}

// The selection text held by the terminal the click landed in, or empty when the click fell outside
// every registered container or that terminal holds no selection. Deliberately a linear scan over a
// handle of entries at menu-open time — the file navigator's registries settle the same trade.
export function terminalSelectionText(target: Element | null): string {
  if (!target) return '';
  let holding: { node: HTMLDivElement; access: TerminalAccess } | undefined;
  for (const [node, access] of terminals) {
    if (!node.contains(target)) continue;
    // The innermost container answers: when an outer registration tries to overwrite one that is
    // already inside it, the already-held one keeps the answer.
    if (holding && node.contains(holding.node)) continue;
    holding = { node, access };
  }
  if (!holding || !holding.access.hasSelection()) return '';
  return holding.access.getSelection();
}
