# Roles tab

`roles` opens a tab that maps named roles — planning, research, code review, implementation,
documentation, or any the user adds — onto an ordered list of harness/model/effort choices, so a
human or an AI task deciding which model to launch for a task reads one role's list instead of
remembering which harness runs which model. The file is the durable output; the tab is its editor.
The tab is reached only through its own command: it claims no file extensions, opens on no file, and
takes no argument. It lives in the center strip like the search tab (see [[tab-plugins]]).

### The command

`roles` opens or focuses the singleton roles tab. `roles` with any argument — `roles left`,
`roles review` — is answered `Usage: roles`: the tab is never docked and there is no per-role open.

### The file

Roles live in `~/.janissary/roles.json`, a JSON object keyed by role name. Each role is a
`description` string and an ordered `entries` list; each entry is a `harness` name, a `model` id,
and an `effort` present only when the entry stores one:

```json
{
  "planning": {
    "description": "Research and development of plans for new product features.",
    "entries": [
      { "harness": "codex", "model": "gpt-6-sol", "effort": "xhigh" },
      { "harness": "claude", "model": "claude-opus-5-5", "effort": "xhigh" }
    ]
  }
}
```

The key order is the role order the tab shows, so a reorder rewrites the keys in their new order.
The `effort` values are the same fixed levels the New harness dialog offers — `low`, `medium`,
`high`, `xhigh`, `max` (see [[harness]]) — plus the default of storing none at all; any other string
a hand-written file carries is passed through verbatim, exactly as `harness --effort` does.

A project's `.janissary/roles.json`, when it exists, **replaces** the home file entirely — no
merging of roles between the two — including when it holds an empty object, which is an explicit
choice of zero roles rather than a request for the defaults.

When neither file exists, the tab creates `~/.janissary/roles.json` holding five default roles:
`planning` (with the two entries above), `research` (`Research, comparison, and information
gathering for a task or question.`), `code review` (`Review of code changes for correctness, style,
and risk.`), `implementation` (`Implementation of an approved plan or a described change.`), and
`documentation` (`Writing and updating specs, plans, and user or developer documentation.`).

### What the tab shows

Two columns. The catalog on the left lists every harness with its known model ids, as loaded from
`harness-models.json` and a project's `.janissary/harness-models.json` override; the roles on the
right are the role cards. Above the cards a line names the file in effect — its full path — or, when
no file decodes, `No roles file in effect`. A problem line appears under it when the roles on screen
are not what the file literally holds.

Each card carries the role's name, its description, and its entries in order. The name and
description edit in place: the change is written when the field loses focus, Enter commits, and
Escape reverts. Every entry row shows the model, the harness, an effort dropdown (`default` plus
the levels above, and the entry's own stored effort as its own option when that value is outside
them, so a hand-written effort never reads as unset), and a remove control. **Add entry** opens a
small picker — harness, model, and Add — so an entry can be added without a pointer.

### A description the tab did not write

A second window on the same file, or any other client of the tab, can change a description while this
one is open, and the tab learns about it the moment that change is published. A field nobody has
typed in shows the new text at once, and losing focus on it writes nothing — the file is already what
it says. A field someone is halfway through typing in is left alone: the tab does not discard typing
under them, and the edit that eventually commits carries the text it was written against, so a
description that changed in the meantime is never overwritten. If the stored description does move
under an open draft, the stored text replaces the draft and the tab says so in the one refusal line
beneath the source line. The same line reports the server's own refusal when the change arrives too
late to be noticed here: `The description of role "<name>" changed elsewhere — nothing was written.`

### Dragging

The tab drags on the browser's own gesture. Dragging a model from the catalog onto a card appends
it as that role's next entry; the drop lands anywhere on the card — its entry rows and the controls
on them included — and every drop appends, nothing is replaced in place, so changing a model is a
remove plus an add. Dragging an entry row onto a sibling row moves it to that position, and dragging
a role's grip onto another card moves the role to that card's position, whether the grip lands on the
card's own space or on one of its entry rows. A card outlines itself while a compatible drag is over
it. Dragging an entry back onto the catalog column removes it from its role. Every completed drop
writes the file before the tab redraws.

### Names

A role's name is trimmed and must be nonempty, and is unique across the list ignoring case. Adding
or renaming to a name another role already holds is refused with `A role named "<name>" already
exists.` and nothing is written. A name typed into the creation control stays in it until the server
accepts it, so a refused one can be corrected and committed again; the control closes as soon as the
role exists. Deleting the last role is an ordinary edit: the list may be empty, and the tab then reads
`No roles yet.` above the add-role control.

### A refused edit

Every refusal the tab can earn — a duplicate name, a role or index that is not there, an unusable
file, a write that could not happen, a description another client changed first — is shown in the tab
as one line beneath the source line, carrying the server's own words, and the edit it refused is not
applied. A refused edit leaves what the user typed on screen so it can be corrected. The line clears
on the next edit the tab raises, whether that edit is accepted or refused, so a message never lingers
over a state it no longer describes.

### Persisting

Every edit writes the effective file first and republishes the tab only after the write succeeds, so
what the tab shows is always what the file holds; there is no Save button and no unsaved state. Two
rapid edits are applied one after the other, the second reading the file the first wrote. A write
that cannot happen — a read-only file, a directory in the file's place — is refused with
`Could not write roles.json at <path>.` and the tab is unchanged.

### When a file does not decode

An unreadable file, one that is not valid JSON, and one whose top level is not an object of roles
all fall back along the chain: a broken project file falls back to the home file, a broken home
file to the default roles. The one line shown names the file, what was wrong, and what is on
screen — `roles.json is not valid JSON at <path> — showing default roles.` — and the broken file is
left untouched on disk. A file that decodes partially is different: roles and entries that are well
formed are served, the damaged ones are dropped and counted, and the line says so —
`roles.json dropped 2 malformed roles or entries at <path> — showing the rest of this file.` While
any file in effect is in that state — nothing decoded, or something dropped — every edit is refused
with `roles.json at <path> is unusable — fix the file before editing roles.` so a fix the user has
not made yet is never overwritten, and the file is left exactly as it is until they make it.

## Editing by hand

`roles.json` is a plain JSON object, and the tab re-reads it every time it opens, so editing it by
hand is supported. A role whose value is not an object with a `description` string and an `entries`
list is dropped, as is an entry missing a `harness` or `model`, a key whose name trims to empty, and
a key whose name another key already trims to. An empty object is a valid file holding zero roles.

## Not in this version

Nothing reads the roles file: no launch dialog, no command flag, and no agent consults a role
description. Consumers read `roles.json` itself. Entries carry harness, model, and effort only.
Keyboard reordering is not provided — adding and removing entries and roles are pointer-free, but
order rides the drag.