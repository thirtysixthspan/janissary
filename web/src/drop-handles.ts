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
