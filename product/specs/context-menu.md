# Context Menu

The application draws its own right-click menus rather than leaving them to the browser. A surface that defines a menu of its own shows that menu — the file navigator's rows are the worked example (see [[file-navigator-tab]]). Everywhere else, a default Copy/Paste menu answers the right-click.

### The default menu

Right-clicking anywhere the application has not defined a menu — an editor tab, a terminal, the command line, a transcript — opens a small menu at the pointer offering **Copy** and **Paste**. It looks and behaves exactly like the file navigator's menu: the same styling, arrow keys and `Enter` to activate an entry, `Escape` or clicking away to dismiss it. Dismissing the menu returns the keyboard to whatever had it before.

Right-clicking the open menu itself does nothing and does not expose the browser's context menu.

An entry that cannot act is left out rather than shown greyed out, so the menu holds one entry, two, or none:

- **Copy** appears whenever page text, editor text, or a terminal's own selection is present, and writes that selection to the system clipboard.
- **Paste** appears only when the right-click reaches somewhere text can go — the field it landed in, or the field that currently holds the keyboard. That second case is what makes an editor tab and a terminal work, since a click there lands on rendered output while the keyboard belongs to the surface as a whole. Activating it inserts the clipboard's text at the caret.

When neither entry applies — a right-click on a surface with nothing selected and nowhere to type — no menu opens at all, and the browser's own menu appears instead.

The editor is the exception: an empty-selection right-click there opens no menu, including the browser's own menu.

### A contributed entry

To select harness terminal output while the harness owns the mouse, hold Shift while dragging (see the selecting-and-copying section in [[harness]]). Releasing that drag over a non-empty pick opens the default menu itself, offering **Copy** alongside **Chat about this**; right-clicking the held selection afterward opens the same menu again.

Replies arriving after a menu closes are ignored. If menus are opened in succession, only the newest menu's reply can supply an entry, regardless of reply order; activating it uses that menu's selection.

Disabled plugins contribute no entries to newly opened menus. An entry offered before its plugin is disabled cannot run afterward. A plugin that has not yet been activated can still offer its declared action without loading until the action runs.

When an entry arrives while the menu is open, the highlighted action stays selected as the entries move. If that action disappears, selection moves to the first remaining entry. Enter activates the highlighted action, and arrow navigation continues from its current position.

A bundled tab plugin may contribute one entry to the default menu for a text selection: `Chat about this`, offered by the conversations plugin. It appears only when the right-click resolves a selection — a DOM selection, an editor's own selection, or, in a terminal, the selection that terminal itself holds — and renders as its own final group after Copy and Paste, separated by a divider. `Cmd+I` on macOS, or `Ctrl+I` elsewhere, runs the same action directly for the current selection. Activating it runs the plugin's own presentation (see [[conversations]]); the label is decided once by the plugin's manifest, and everything a second right-click sees is offered again from scratch, so a menu that closed without it carries nothing into the next one.

The terminal paragraph above is narrowed by that entry and only by it: the menu may read an xterm selection to answer **Chat about this**, and offers **Copy** for that same selection — the terminal's own copy shortcut still works too, unaffected by the menu.

### Surfaces that define their own menu

A surface with a menu of its own keeps it; the default never overrides or extends it. The file navigator's row menu is unchanged, including its own Copy and Paste, which act on files rather than on text. Its Copy additionally puts the copied paths on the system clipboard as text, so the default menu's Paste elsewhere inserts them (see [[file-navigator-tab]]).

### Relationship to the copy and paste shortcuts

The menu is an addition, not a replacement. `Cmd+C`/`Cmd+V` in an editor tab, and the terminal's own copy shortcuts, behave exactly as before, and act on the same selection the menu's Copy would.
