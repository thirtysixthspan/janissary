// The contracts a file-navigator drag releases onto. Each drop target implements one, so the
// navigator's drag code can name a target without importing the feature that implements it.

// Exposed by the command bar through a `dropRef` so a drag can insert a dropped path and highlight
// the bar as a valid drop target, mirroring `recallRef`'s imperative-escape-hatch pattern.
export type CommandInputDropHandle = {
  insertAtCaret: (text: string) => void;
  setDropHighlighted: (active: boolean) => void;
};

// Exposed by an editor tab so a drag can insert a dropped path at the cursor, and by a harness tab
// so a drag can type a dropped path into its terminal. Unlike the command bar's, these two are
// published through `drop-registry.ts` — an editor under its tab label, a harness under its PTY id —
// rather than through a single ref the active tab claims: every editor and harness tab stays
// mounted and a split pane can leave two of them visible at once, so "whichever one is active" would
// deliver the drop to the wrong one.
export type EditorDropHandle = { insertAtCaret: (text: string) => void };

export type HarnessDropHandle = { insertAtCaret: (text: string) => void };
