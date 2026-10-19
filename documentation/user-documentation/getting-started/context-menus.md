# Right-click menus

Right-click almost anywhere in Janissary to copy or paste text, or open clipboard history. The [file navigator](/user-documentation/tab-types/file-navigator#mouse) draws its own menu instead, and keeps using it.

## The default menu

<img class="agent-float" src="/agents/malik-south.png" alt="" />

Right-click an editor tab, a terminal, the command line, a transcript, or another part of the app without its own menu to open a small menu at the pointer. Use `↑`/`↓` and `Enter` to pick an entry, or `Escape` or a click away to dismiss the menu without picking one. Dismissing it returns the keyboard to whatever held it before. Right-clicking the open menu does nothing at all, and your browser's own menu does not appear either.

The menu offers **Paste from clipboard…** every time. It opens [clipboard history](/user-documentation/command-bar/clipboard), even when there is no selection or place to type. The other entries appear only when they can act:

- **Copy** appears whenever page text, editor text, or a terminal's own selection is present, and copies that text.
- **Paste** appears only where text can go — the field you clicked, or the field that already holds the keyboard. That second case is what makes right-clicking an editor tab or a terminal work, since the click lands on rendered output while the keyboard belongs to the tab as a whole. Activating it inserts the clipboard's text at the caret. Paste is withheld while a terminal's held selection is showing, even if some other field still holds the keyboard.

The menu also opens when nothing is selected and nowhere can receive text. Right-clicking the editor works the same way, even when it has no selection. The browser's own menu does not appear.

Finishing a Shift+drag selection in a terminal (see [Copying text out of a harness](/user-documentation/advanced-agents/harness#copying-text-out-of-a-harness)) opens this menu automatically. Right-clicking the held selection afterward opens it again.

## Search for this and Chat about this

<img class="agent-float left" src="/agents/orhan-south-west.png" alt="" />

Right-click a text selection — on the page, in an editor, or in a terminal — and the menu also offers two more entries. They sit in their own group after the default entries, behind a divider:

- **Search for this** opens the [search tab](/user-documentation/command-bar/project-search), puts the selected text in its search bar, and searches the project for it. The search tab gets the keyboard, just as it does after `search <phrase>`.
- **Chat about this** starts an AI conversation about the selected text. `Cmd+I` on macOS, or `Ctrl+I` elsewhere, runs it directly, without opening the menu first. See [Keyboard shortcuts](/user-documentation/getting-started/keyboard) for the shortcut and [Conversations](/user-documentation/tab-types/conversations) for what it opens.

## What the menu does not replace

The menu sits alongside the copy and paste shortcuts rather than in place of them. `Cmd+C` and `Cmd+V` in an editor tab, and a terminal's own copy chords, work exactly as they always did, on the same selection the menu's **Copy** would take.

A plugin's entry is only as good as the plugin behind it. Disable that plugin while the menu is open and choosing its entry does nothing at all: no line in the transcript, nothing in the notifications feed, and the menu closes as if you had dismissed it.

## Menus a view defines itself

A view that draws its own right-click menu keeps it; the default menu never overrides it or adds to it. The [file navigator](/user-documentation/tab-types/file-navigator#mouse)'s row menu is the only one today: it offers file actions like Open, Edit, and Delete, along with its own Copy and Paste, which act on files rather than on selected text.
