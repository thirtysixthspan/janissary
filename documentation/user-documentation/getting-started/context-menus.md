# Right-click menus

Right-click almost anywhere in Janissary to copy or paste text. A few views draw their own menu instead, and keep using it.

## The default menu

<img class="agent-float" src="/agents/malik-south.png" alt="" />

Right-click an editor tab, a terminal, the command line, or a transcript to open a small menu at the pointer, offering **Copy** and **Paste**. Use `↑`/`↓` and `Enter` to pick an entry, or `Escape` or a click away to dismiss the menu without picking one. Dismissing it returns the keyboard to whatever held it before.

The menu only ever shows what it can actually do:

- **Copy** appears only when page or editor text is selected, and copies that text.
- **Paste** appears only where text can go — the field you clicked, or the field that already holds the keyboard. That second case is what makes right-clicking an editor tab or a terminal work, since the click lands on rendered output while the keyboard belongs to the tab as a whole. Activating it inserts the clipboard's text at the caret.

## When nothing applies

If neither Copy nor Paste can act — nothing is selected and there's nowhere to type — no menu opens, and your browser's own menu appears instead. The editor is the exception: right-clicking it with nothing selected opens no menu at all, not even the browser's.

A terminal's menu offers Paste but never Copy. A terminal's selection lives outside the page, so use the terminal's own copy shortcut to copy from it instead — see [Copying text out of a harness](/user-documentation/advanced-agents/harness#copying-text-out-of-a-harness).

## Chat about this

Right-click a text selection — on the page, in an editor, or in a terminal — and the menu also offers **Chat about this**, which starts an AI conversation about the selected text. `Cmd+I` on macOS, or `Ctrl+I` elsewhere, runs the same action directly, without opening the menu first. See [Keyboard shortcuts](/user-documentation/getting-started/keyboard) for the shortcut and [Conversations](/user-documentation/tab-types/conversations) for what it opens.

## Menus a view defines itself

A few views draw their own right-click menu, and the default menu never overrides it. The [file navigator](/user-documentation/tab-types/file-navigator#mouse)'s row menu is the main example: it offers file actions like Open, Edit, and Delete, along with its own Copy and Paste, which act on files rather than on selected text.
