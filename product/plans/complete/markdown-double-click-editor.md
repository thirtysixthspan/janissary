# Markdown double-click opens the editor, Shift+double-click opens the preview

**Complexity: 2/10** — a single boolean-logic change in one mouse handler, plus updating tests
and the spec table that document the current (opposite) behavior for markdown files.

## Goal

In the file navigator, double-clicking a **markdown** file (`.md`/`.markdown`) should open it in
the plain-text **editor tab**, and Shift+double-clicking it should open the rendered **markdown
preview tab**. This is the inverse of the navigator's general file behavior (double-click →
`open`, Shift+double-click → `edit`), and the inverse of markdown's *current* double-click
behavior specifically. Every other file type keeps today's behavior unchanged.

This only affects mouse double-click in the file navigator. Keyboard activation (`Enter` /
`Shift+Enter` in the tree) is a separate, unmentioned interaction and stays as-is.

## Current behavior (confirmed)

`web/src/FileTreeTab.tsx`'s `onRowDoubleClick` sends `open <path>` on a plain double-click and
`edit <path>` on Shift+double-click, for every file type.

- `src/openers/markdown.ts` + `src/open-file-manager.ts`: `open <path>` on `.md`/`.markdown`
  routes to `openMarkdownTab` (the rendered preview). `edit <path>` always bypasses the opener
  registry and forces `openEditorTab` (`src/openers/editor.ts`'s `openInEditor`), for any
  extension including markdown.
- Net effect today: **double-click a `.md` file → preview; Shift+double-click → editor.** The
  issue asks for the opposite specifically for markdown.

No server-side change is needed — `open`/`edit` command routing already does the right thing;
only the client needs to pick which command to send for markdown files.

## Approach

Add a markdown-extension check in `onRowDoubleClick` and flip the `open`/`edit` choice when the
row is markdown, leaving every other extension's behavior untouched.

## Implementation steps

1. **`web/src/FileTreeTab.tsx`** — add a small extension check and use it in `onRowDoubleClick`:

   ```ts
   const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

   const onRowDoubleClick = (row: FileTreeRow, shiftKey: boolean) => {
     if (row.path === '..') reroot();
     else if (row.dir) toggle(row.path);
     else if (MARKDOWN_EXTENSION.test(row.path) === shiftKey) openFile(row.path);
     else editFile(row.path);
   };
   ```

   Truth table: markdown + no-shift → `edit` (editor tab); markdown + shift → `open` (preview);
   non-markdown + no-shift → `open` (unchanged); non-markdown + shift → `edit` (unchanged).

## Tests

`web/src/FileTreeTab.test.tsx` already has two tests exercising double-click on `README.md`
(currently the only markdown fixture row) that assert today's behavior — they must be repointed
to a non-markdown fixture row so they keep covering the *general* file case, plus two new tests
covering the markdown-specific inversion:

1. Change **"double-click on a file row sends an open command"** to double-click `index.ts`
   (non-markdown) instead of `README.md`, still expecting `open src/index.ts`.
2. Change **"Shift+double-click on a file row sends an edit command"** to Shift+double-click
   `index.ts` instead of `README.md`, still expecting `edit src/index.ts`.
3. Add **"double-click on a markdown file row sends an edit command"** — double-click
   `README.md`, expect `{ method: 'command', params: { text: 'edit README.md' } }`.
4. Add **"Shift+double-click on a markdown file row sends an open command"** — Shift+double-click
   `README.md`, expect `{ method: 'command', params: { text: 'open README.md' } }`.

## Spec updates

**`specs/file-tree-tab.md`** — "Mouse interactions" table (around lines 89 and 92) documents the
old blanket behavior. Update both rows to carve out the markdown exception:

- Double-click a file row: note that markdown files instead open in the plain-text editor.
- Shift+double-click a file row: note that markdown files instead open the rendered preview
  (rather than being included in "even for files whose normal opener is a viewer").

## Out of scope

- Keyboard `Enter`/`Shift+Enter` activation in the tree (`file-tree-keys.ts`) — the issue only
  describes mouse double-click; keyboard activation keeps sending `open`/`edit` unconditionally.
- Any other file type's opener behavior.
- Command-line `open`/`edit` behavior outside the file navigator (already correct, per the
  scoping read above).

## Verification

- `./scripts/run.mjs check-diff` — lints, incrementally typechecks, and runs the affected web
  tests.
- Manual: not verifiable in this environment (no browser); the automated tests above exercise
  the exact click/shift-click paths.
