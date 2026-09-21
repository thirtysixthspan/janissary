// The contracts a file-navigator drag releases onto. Each drop target implements one and publishes
// it through a `dropRef`, so the navigator's drag code can name a target without importing the
// feature that implements it.

// Exposed by the command bar so a drag can insert a dropped path and highlight the bar as a valid
// drop target, mirroring `recallRef`'s imperative-escape-hatch pattern.
export type CommandInputDropHandle = {
  insertAtCaret: (text: string) => void;
  setDropHighlighted: (active: boolean) => void;
};

// Exposed by the editor tab so a drag can insert a dropped path at the cursor.
export type EditorDropHandle = { insertAtCaret: (text: string) => void };

// Exposed by a harness tab so a drag can type a dropped path into its terminal. Unlike the two
// above, this one is published through `harness-drop-registry.ts` under the tab's PTY id rather
// than through a single ref the active tab claims: every harness tab stays mounted and a split
// pane can leave two of them visible at once, so "whichever one is active" would deliver the drop
// to the wrong terminal.
export type HarnessDropHandle = { insertAtCaret: (text: string) => void };
