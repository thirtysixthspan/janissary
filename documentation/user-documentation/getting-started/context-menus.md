# Right-click menus

Right-click almost anywhere in Janissary to copy or paste text, or open clipboard history. The [file navigator](/user-documentation/tab-types/file-navigator#mouse) draws its own menu instead, and keeps using it.

## The default menu

<img class="agent-float" src="/agents/malik-south.png" alt="" />

Right-click an editor tab, a terminal, the command line, a transcript, or another part of the app without its own menu to open a small menu at the pointer. It looks like the [command picker](/user-documentation/command-bar/history): a bordered list with the first entry highlighted. If the pointer is near the right or bottom edge of the window, the menu slides back inside it.

Use `↑`/`↓` to move the highlight. It stops at the first and last entries. Press `Enter` or click to pick the highlighted entry, or press `Escape` or click away to close the menu without picking one. Right-clicking the open menu does nothing at all, and your browser's own menu does not appear either.

When the menu closes, the keyboard goes to the field a paste would have used. That is the text field you right-clicked, or, when you didn't click one, whatever held the keyboard before.

The menu offers **Paste from clipboard…** every time. It opens [clipboard history](/user-documentation/command-bar/clipboard), even when there is no selection or place to type. Click an entry there to paste into the field you right-clicked. Press `Return` instead and the entry goes to the keyboard cursor, because the menu has closed by then. Afterwards the keyboard goes back to where it was, unless the paste landed in a different text field. If the clipboard-history popup has been disabled, the entry stays in the menu but does nothing. The other entries appear only when they can act:

- **Copy** appears whenever page text, editor text, or a terminal's own selection is present, and copies that text.
- **Paste** appears only where text can go: the field you clicked, or the field that already holds the keyboard. That second case is what makes right-clicking an editor tab or a terminal work, since the click lands on rendered output while the keyboard belongs to the tab as a whole. Activating it inserts the clipboard's text at the caret. If the clipboard is empty, or your browser won't let Janissary read it, nothing is pasted. Paste is withheld while a terminal's held selection is showing, even if some other field still holds the keyboard.

The menu also opens when nothing is selected and nowhere can receive text. Right-clicking the editor works the same way, even when it has no selection.

Finishing a Shift+drag selection in a terminal (see [Copying text out of a harness](/user-documentation/advanced-agents/harness#copying-text-out-of-a-harness)) opens this menu automatically. Right-clicking the held selection afterward opens it again. On that menu, `Escape` and **Copy** both let go of the terminal's selection, so one keypress leaves copy mode instead of only closing the menu. **Search for this** and **Chat about this** leave the selection held.

## Act on selected text

<img class="agent-float left" src="/agents/orhan-south-west.png" alt="" />

Right-click a text selection, on the page, in an editor, or in a terminal, and the menu also offers two more entries, three when the selection is a web address. They sit in their own group after the default entries, behind a divider:

- **Open this URL** comes first in that group, but only when the selection is a web address: the whole selection, starting with `http://` or `https://`. Spaces or a line break around the address don't matter. It opens the address in a new [page tab](/user-documentation/tab-types/web-pages), just like `open <url>`. A bare domain such as `example.com`, or a sentence with a link in it, doesn't get this entry.
- **Search for this** opens the [search tab](/user-documentation/command-bar/project-search), puts the selected text in its search bar, and searches for it. In a tab that works in a workspace, it searches that workspace; anywhere else, it searches the project. The search tab gets the keyboard, just as it does after `search <phrase>`.
- **Chat about this** starts an AI conversation about the selected text. `Cmd+I` on macOS, or `Ctrl+I` elsewhere, runs it directly, without opening the menu first. It does nothing when no text is selected. See [Keyboard shortcuts](/user-documentation/getting-started/keyboard) for the shortcut and [Conversations](/user-documentation/tab-types/conversations) for what it opens.

**Open this URL** is there the moment the menu opens. **Search for this** and **Chat about this** are looked up while it is open, so they can join the group a moment later. The highlighted entry stays highlighted when they arrive. If it is one that disappears, the highlight moves to the first entry left.

These entries act on the tab the selection is in, which is the tab you right-clicked. For `Cmd+I`, it is the tab that holds the keyboard. When the selection isn't in any tab, they use the active tab.

## What the menu does not replace

<img class="agent-float" src="/agents/tahir-south-east.png" alt="" />

The menu sits alongside the copy and paste shortcuts rather than in place of them. `Cmd+C` and `Cmd+V` in an editor tab, and a terminal's own copy chords, work exactly as they always did, on the same selection the menu's **Copy** would take.

**Search for this** and **Chat about this** come from plugins. A plugin that is disabled adds nothing to a menu you open afterwards. Disable it while a menu is already open and choosing its entry does nothing at all: no line in the transcript, nothing in the notifications feed, and the menu closes as if you had dismissed it.

## Menus a view defines itself

A view that draws its own right-click menu keeps it; the default menu never overrides it or adds to it. The [file navigator](/user-documentation/tab-types/file-navigator#mouse)'s row menu is the only one today: it offers file actions like Open, Edit, and Delete, along with its own Copy and Paste, which act on files rather than on selected text.
