// The imperative focus contracts a tab surface publishes through a ref. Each surface implements one
// and hands it up via `forwardRef`, so the focus hooks can name a surface without importing the
// component that draws it.

// Exposed by the harness tab so a tab switch can put the cursor back in its terminal.
export type HarnessTabHandle = { focus(): void };

// Exposed by the shell tab, which takes over the tab body while an interactive program runs.
export type ShellTabHandle = { focus(): void };

// Exposed by the question dialog so a tab switch lands on its cancel button rather than the body
// behind it.
export type QuestionPanelHandle = { focusCancel(): void };

// Exposed by any tab with unsaved changes so shared close and quit guards can save or focus it.
export type DirtyTabHandle = { isDirty(): boolean; save(): Promise<void>; focus(): void };
