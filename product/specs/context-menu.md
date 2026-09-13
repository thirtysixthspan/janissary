# Context Menu

The application draws its own right-click menus rather than leaving them to the browser. A surface that defines a menu of its own shows that menu — the file navigator's rows are the worked example (see [[file-navigator-tab]]). Everywhere else, a default Copy/Paste menu answers the right-click.

### The default menu

Right-clicking anywhere the application has not defined a menu — an editor tab, a terminal, the command line, a transcript — opens a small menu at the pointer offering **Copy** and **Paste**. It looks and behaves exactly like the file navigator's menu: the same styling, arrow keys and `Enter` to activate an entry, `Escape` or clicking away to dismiss it. Dismissing the menu returns the keyboard to whatever had it before.

An entry that cannot act is left out rather than shown greyed out, so the menu holds one entry, two, or none:

- **Copy** appears only when text is selected, and writes that selection to the system clipboard.
- **Paste** appears only when the right-click reaches somewhere text can go — the field it landed in, or the field that currently holds the keyboard. That second case is what makes an editor tab and a terminal work, since a click there lands on rendered output while the keyboard belongs to the surface as a whole. Activating it inserts the clipboard's text at the caret.

When neither entry applies — a right-click on a surface with nothing selected and nowhere to type — no menu opens at all, and the browser's own menu appears instead.

### A contributed entry

When an entry arrives while the menu is open, the highlighted action stays selected as the entries move. If that action disappears, selection moves to the first remaining entry. Enter activates the highlighted action, and arrow navigation continues from its current position.

A bundled tab plugin may contribute one entry to the default menu for a text selection: `Chat about this`, offered by the conversations plugin. It appears only when the right-click resolves a selection — a DOM selection or, in a terminal, the selection that terminal itself holds — and renders as its own group above Copy and Paste. Activating it runs the plugin's own presentation (see [[conversations]]); the label is decided once by the plugin's manifest, and everything a second right-click sees is offered again from scratch, so a menu that closed without it carries nothing into the next one.

The terminal paragraph above is narrowed by that entry and only by it: the menu may read an xterm selection to answer **Chat about this**, but a terminal's menu still offers no Copy — the terminal's copy shortcut remains the way to copy from it, because the selection lives outside the page and Copy's contract is the page's text.

### Surfaces that define their own menu

A surface with a menu of its own keeps it; the default never overrides or extends it. The file navigator's row menu is unchanged, including its own Copy and Paste, which act on files rather than on text. Its Copy additionally puts the copied paths on the system clipboard as text, so the default menu's Paste elsewhere inserts them (see [[file-navigator-tab]]).

### Relationship to the copy and paste shortcuts

The menu is an addition, not a replacement. `Cmd+C`/`Cmd+V` in an editor tab, and the terminal's own copy shortcuts, behave exactly as before. A terminal's selection lives outside the page, so a terminal's right-click menu offers Paste but no Copy — the terminal's copy shortcut remains the way to copy from it.
