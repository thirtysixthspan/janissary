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
`description` string, an ordered `entries` list, and a `commands` list of granted native ACP
commands. Each entry is a `harness` name, a `model` id, and an `effort` present only when the entry
stores one. The `commands` list follows `entries` in the file; an empty list grants no commands.

```json
{
  "planning": {
    "description": "Research and development of plans for new product features.",
    "entries": [
      { "harness": "codex", "model": "gpt-6-sol", "effort": "xhigh" },
      { "harness": "claude", "model": "claude-opus-5-5", "effort": "xhigh" }
    ],
    "commands": []
  }
}
```

The textual key order is the role order the tab shows, including numeric names, so a reorder
rewrites the keys in their new order. Numeric names are never sorted numerically during reading
or saving. Special names such as `__proto__` retain their descriptions, entries, and commands like
any other role, including duplicate model choices. Unknown command strings and duplicate command
grants from a hand-written file are preserved. A missing `commands` field means the role grants no
commands.
The `effort` values are the same fixed levels the New harness dialog offers — `low`, `medium`,
`high`, `xhigh`, `max` (see [[harness]]) — plus the default of storing none at all; any other string
a hand-written file carries is passed through verbatim, exactly as `harness --effort` does.

A project's `.janissary/roles.json`, when it exists, **replaces** the home file entirely — no
merging of roles between the two — including when it holds an empty object, which is an explicit
choice of zero roles rather than a request for the defaults.

When neither file exists, the tab creates `~/.janissary/roles.json` holding seven default roles:
`planning` (with the two entries above), `research` (`Research, comparison, and information
gathering for a task or question.`), `code review` (`Review of code changes for correctness, style,
and risk.`), `implementation` (`Implementation of an approved plan or a described change.`),
`documentation` (`Writing and updating specs, plans, and user or developer documentation.`), and
`ask` (`When you ask a question via ACP.`) with three entries in order: `opencode`
`opencode-go/deepseek-v4.1-flash` at `medium`, `claude` `claude-haiku-4-5` at `high`, and `codex`
`gpt-6-luna` at `high`. The `tell` role follows `ask`, has the description `When you tell a model to
carry out a task via ACP.`, and starts with the same three entries. The `ask` role grants `db sqlite
list`, `db sqlite query`, `browser goto`, `browser content`, `question ask`, and `question approve`.
The `tell` role grants all nine native commands: those six plus `db sqlite create`, `db sqlite
delete`, and `browser eval`. `planning`, `research`, `code review`, `implementation`, and
`documentation` start with no command grants. Only `planning`, `ask`, and `tell` start with entries.

### What the tab shows

The tab shows role cards and no model catalog column. Above the cards, a line names the file in
effect — its full path — or, when no file decodes, `No roles file in effect`. A problem line appears
under it when the roles on screen are not what the file literally holds.

Each card carries the role's name, description, ordered model entries, and command grants. Its
`Models` and `Commands` lists have the accessible names `Models of role <name>` and
`Commands of role <name>`. An entry whose model is no longer enabled is dimmed and titled `Not in the
model catalog`; the entry remains on the card and in `roles.json`. The marker is recomputed when the
model catalog changes and is not stored in the roles file. The model picker offers only the enabled
models from the current catalog.

The name and description edit in place: the change is written when the field loses focus, Enter
commits, and Escape reverts. The `Models` section shows a muted `No models` row when empty. Every
entry row shows the model, the harness, an effort dropdown (`default` plus the levels above, and the
entry's own stored effort as its own option when that value is outside them, so a hand-written
effort never reads as unset), and a remove control. **Add model** opens a small picker — harness,
model, effort, and Add — so an entry can be added without a pointer. The picker starts on `default`
and returns there when the harness changes or the picker is reopened, so no entry carries an effort
nobody chose for it.

The `Commands` section shows native grants in the published vocabulary order, followed by unknown
hand-written values in their stored order. Duplicate grants remain adjacent and visible. Unknown
commands are dimmed, titled `Not a native command`, and can be removed. A muted `No commands` row
appears when a role has none. **Add command** opens a dropdown of native commands the role does not
already have, followed by Add and Cancel; Add stays disabled until a choice is made. The button is
hidden when all nine native commands are present. Add sends `add-command`; removing any duplicate
row sends `remove-command`, which removes every copy. If another client changes a command while the
picker is open, it clears a selection that is no longer available or closes when no commands remain
to add, and the card follows the next publication. Both pickers focus their first control when
opened, cancel on Escape, and return focus to their own add button on Add, Cancel, or Escape. If a
publication leaves no commands to add while the picker is open, or removes the focused **Add
command** button, focus moves to the `Commands` heading. At narrow pane widths, command text wraps
without pushing its remove control out of view.

### A description the tab did not write

A second window on the same file, or any other client of the tab, can change a description while this
one is open, and the tab learns about it the moment that change is published. A field nobody has
typed in shows the new text at once, and losing focus on it writes nothing — the file is already what
it says. A field someone is halfway through typing in is left alone: the tab does not discard typing
under them, and the edit that eventually commits carries the text it was written against, so a
description that changed in the meantime is never overwritten. If the stored description does move
under an open draft, the stored text replaces the draft and the tab says so in the one refusal line
beneath the source line. A description this tab wrote itself is not such a move: the saved text comes
back in the next publication, the field follows it, and no line is raised, because nothing anybody
typed was displaced. The same line reports the server's own refusal when the change arrives too late
to be noticed here: `The description of role "<name>" changed elsewhere — nothing was written.`

### Dragging

The tab drags on the browser's own gesture. Dragging an entry row onto a sibling row moves it to that
position, and dragging a role's grip onto another card moves the role to that card's position,
whether the grip lands on the card's own space or on one of its entry rows. A card outlines itself
while a compatible drag is over it. The entry picker adds models, and the row remove control removes
an entry; there are no catalog drag targets. Every completed reorder writes the file before the tab
redraws.

### Names

A role's name is trimmed and must be nonempty, and is unique across the list ignoring case. Adding
or renaming to a name another role already holds is refused with `A role named "<name>" already
exists.` and nothing is written. A name typed into the creation control stays in it until the server
accepts it, so a refused one can be corrected and committed again; the control closes as soon as the
role exists. Enter and blur may both submit the same draft, but while that name's request is pending
the tab sends it only once. A different name typed while the request is pending can be submitted
independently. If an earlier request is accepted after the user has typed a different name, that
acceptance leaves the newer draft and creation control untouched. Deleting the last role is an
ordinary edit: the list may be empty, and the tab then reads `No roles yet.` above the add-role
control.

### A refused edit

Every refusal the tab can earn — a duplicate name, a role or index that is not there, an unusable
file, a write that could not happen, a description or entry list another client changed first — is shown in the tab
as one line beneath the source line, carrying the server's own words, and the edit it refused is not
applied. A refused edit leaves what the user typed on screen so it can be corrected. The line clears
on the next edit the tab raises, whether that edit is accepted or refused, so a message never lingers
over a state it no longer describes.

### Persisting

Every edit writes the effective file first and republishes the tab only after the write succeeds, so
what the tab shows is always what the file holds; there is no Save button and no unsaved state. Two
rapid edits are applied one after the other, the second reading the file the first wrote. A write
that cannot happen — a read-only directory, a directory in the file's place — is refused with
`Could not write roles.json at <path>.` and the tab is unchanged. A failed write or replacement
preserves the previous file contents and removes temporary output. Successful edits retain the
file's existing permissions. Adding a command a role already grants, or removing a command it does
not grant, leaves the roles file unchanged. Removing a granted command removes every duplicate
copy.

### An entry list that changed before an edit

Removing, reordering, or changing an entry's effort carries the entire ordered entry list the
user saw, including stored efforts and duplicate choices. A drag uses the list from when the
gesture began. Each edit checks that list against the effective file after earlier queued edits
have settled. If it changed, the current roles are shown and the request is refused with
`The entries of role "<name>" changed elsewhere — retry the edit on the current list. Nothing was written.`
The refused request does not write the file or change another entry. The user can retry against
the refreshed list.

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
not made yet is never overwritten, and the file is left exactly as it is until they make it. That
refusal belongs to the file the tab is editing, never to the file that broke: once the tab has
fallen back to a file that is whole, that file takes the edit and stays editable, and the broken one
is still left exactly as it is.

## Editing by hand

`roles.json` is a plain JSON object, and the tab re-reads it every time it opens, so editing it by
hand is supported. A role whose value is not an object with a `description` string and an `entries`
list is dropped, as is a role whose `commands` value is not a list of strings. An entry missing a
`harness` or `model`, a key whose name trims to empty, and a key whose name another key already
trims to are dropped as well. An empty object is a valid file holding zero roles.

## Not in this version

The core ACP sessions behind `ask` and `tell` also read roles. Each command reads its matching role's
model entries and command grants fresh for each prompt, never creating a file (see [[acp]]). When
the matching role does not exist in the file in effect, its built-in entries and grants apply. When
an existing role has no entries, its model entries fall back to the built-in defaults while its own
grants stay in effect; an empty or missing `commands` list grants no tools. A nonempty model list
whose entries are all disabled does not fall back to the built-in models. No launch dialog, command
flag, or agent consults a role description. Other consumers read `roles.json` itself. Entries carry
harness, model, and effort; `commands` contains native ACP grants.
Keyboard reordering is not provided — adding and removing entries and roles are pointer-free, but
order rides the drag.
