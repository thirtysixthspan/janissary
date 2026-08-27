# Editor Plugins

Janissary can ship bundled plugins that contribute editing commands to the editor tab. An editor plugin binds a keyboard chord and answers with the edits to make and where to leave the selections — that is the whole of what it does. Editor plugins are part of the Janissary build; there is no installation, marketplace, filesystem discovery, or third-party loading.

They are a separate family from the tab plugins described in [[tab-plugins]], which contribute view tabs, file openers, and commands. An editor plugin contributes none of those, opens nothing, and shows nothing of its own.

### Where they run

An editor plugin runs entirely in the client, alongside the editor it extends. Pressing its chord does not consult the server, so a plugin's answer costs no round trip and an editor with no network is still fully commentable. The only thing that reaches the server is a report when a plugin breaks, so the failure appears in the notifications tab rather than nowhere.

### Declaration and bindings

A static declaration supplies the plugin identity and version, the required editor-plugin API version, and one or more bindings. A binding names a command, the keyboard chord that fires it, and how much of the buffer the command needs — either the selection or the whole document.

Reading the declaration table loads no plugin behavior, so the set of chords the editor answers to is known before anything is fetched. A plugin's implementation is fetched the first time one of its chords is pressed and reused for every press afterwards; a session that never presses a plugin chord never downloads it.

A declaration is checked once. One that requires a different API version, declares no bindings, or declares a chord the editor keeps for itself is refused, and that plugin contributes nothing and starts disabled with the reason. Only one rule governs which chords may be declared, and it asks only whether the chord could ever fire: an unmodified printable key is refused because it types a character instead, and so is a chord the editor has its own binding for.

### Chord resolution

The editor's own key bindings win, apart from the two the editor explicitly hands over. A plugin chord is otherwise offered only a keydown the editor itself leaves unbound, so no plugin can shadow saving, undo, find, or any other built-in editing key. A binding that claims a chord the editor uses and never hands over could never fire, so it is reported and that plugin is disabled rather than left silently dead.

The editor hands over exactly three chords: Tab while the selection spans more than one line, Shift+Tab always, and Escape while more than one selection is active. Each is offered to plugins first, and if no plugin claims one the editor's own action for it runs instead — so Tab still inserts a tab character and Escape still collapses the selection when the plugin bound to it is disabled, rather than doing nothing. Which chords are handed over is the editor's decision, not something a plugin can ask for.

A chord may be claimed by only one plugin. The first claimant keeps it and any later one contributes nothing and starts disabled with that reason; the editor still works normally and every other plugin is unaffected.

### What a command receives

A command is given the name it was invoked as, the file's name, every selection the editor currently holds, the whole lines the requested slice covers, and the document range those lines came from. The selections arrive in the order they were created, the most recent one last, and there is always at least one — a command that only cares about a single selection reads that last one. A command that asked for the selection receives the whole lines the selection spans, or the caret's line when nothing is selected — so it always receives real text and never has to handle an empty request. A command that asked for the buffer receives the whole document.

The file's name is how a command varies by language; the declaration carries no language or file-type field of its own.

### What a command may change

A command answers with a list of range replacements and, optionally, a whole new set of selections — in creation order, the new primary last. Answering with no selections at all leaves the editor's set as it was; answering with an empty set is refused, since an editor always has at least one caret. Every position it names is a position in the whole document, whichever slice it was given.

Text and selections are the only things a command may change. It cannot save, scroll, rename, close, or open anything, cannot reach another tab or the file system, and has no way to draw anything of its own. Scrolling needs no separate action: moving the cursor brings the caret into view exactly as any other cursor movement does.

A command that has nothing to do answers with nothing, and the press is a silent no-op — the buffer, the selection, and the undo history are all untouched and no message appears.

### Applying an answer

An accepted answer is applied as a single undo step, however many separate ranges it changed, so one undo restores all of it at once.

An answer is checked against the buffer before any of it is applied. An answer naming a position outside the document, two changes covering overlapping ranges, or two selections covering overlapping ranges, is refused whole: nothing is applied, no undo step is recorded, and the plugin is disabled. Nothing is ever partially applied, and a bad answer never silently corrupts the text by being clamped to fit.

### Failure

A plugin that fails to load, whose command fails, whose command takes too long, or whose answer is refused is disabled for the rest of the session. Its chords stop resolving and the editor behaves exactly as it did before that plugin existed; every other plugin keeps working. One line naming the plugin and the reason appears in the notifications tab, attributed to the editor tab the chord was pressed in, and repeat failures from an already-disabled plugin add nothing further.

A command that answers within its deadline is bounded; one that blocks outright is not, because a bundled plugin runs with the same trust as the rest of the application. Editor plugins are trusted code shipped in the build, not sandboxed third-party code.

Disabling lasts for the session only. Reloading the page starts every plugin fresh.

### Bundled commenting plugin

The commenting plugin binds Cmd+/ to toggling comments over the selection, or over the caret's line when nothing is selected. See [[editor-tab]] for what the command does to the text.

### Bundled indenting plugin

The indenting plugin contributes two commands, indent and outdent, over the same slice: the whole lines the selection covers, or the caret's line when nothing is selected. Indent is bound to Cmd+] and to Tab, outdent to Cmd+[ and to Shift+Tab — two of the chords the editor hands over. See [[editor-tab]] for what the commands do to the text.

### Bundled multiselect plugin

The multiselect plugin contributes the three commands that decide which occurrences of the selected text become selections: Cmd+D adds the next one, Cmd+U drops the most recently added, and Escape — the third handed-over chord, offered only while more than one selection is active — collapses back to one. It is the only bundled plugin that never changes text: every one of its commands answers with selections alone.

Everything the editor does *with* several selections once they exist — drawing them, typing into all of them, moving each caret — belongs to the editor itself, not to this plugin, because a plugin never sees a printable keystroke or an arrow key. See [[editor-tab]] for that behavior.
