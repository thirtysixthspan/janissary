# Roles

Name what kind of work you are about to do once, and keep the model choices that suit it beside the name.

```
roles
```

## Set up your roles

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

The tab opens in the center strip with two columns. **Models** on the left lists every harness you can launch and the models each one knows. Your roles sit on the right, and the line above them names the file you are editing — `~/.janissary/roles.json`, or your project's own file when it has one.

A role has a name, a description, and an ordered list of choices. The description is plain text: write what the role is for, so you or an agent can tell `planning` from `research` at a glance. The tab is an editor for that list. It doesn't launch anything; see [what roles don't do yet](#what-roles-dont-do-yet).

If neither your project nor your home folder has a `roles.json` file, opening the tab creates five roles for you: **planning**, **research**, **code review**, **implementation**, and **documentation**. Each one starts with a description and no model choices, except **planning**, which comes with two. If either file already exists, the tab uses it instead and does not add the defaults. A file holding just `{}` counts as a file: it means you chose zero roles, so the tab shows none.

## Add a model to a role

Drag a model from the **Models** column onto a role card and it becomes that role's next choice. Drop it anywhere on the card — on one of its existing model rows, or on the controls there, as much as on the empty space around them. Every drop adds, so if you drop the wrong one, remove it and drag the right one in.

Without a mouse, click **Add entry** on the card, pick the harness, the model, and an effort, and press **Add**. The effort picker starts on `default` and returns to it when you change the harness or reopen the picker, so a choice never carries over to an entry you did not make it for.

Each choice row carries an effort dropdown: `default`, `low`, `medium`, `high`, `xhigh`, or `max`. `default` stores no effort at all for that choice; the other levels are the same ones the **New harness** dialog offers. If a hand-written role has another effort value, that value stays visible as an option in its dropdown. Change it whenever you like: the tab saves as you go. If saving fails, it shows `Could not write roles.json at <path>.` and preserves your previous file and the choices on screen.

## Reorder and remove

Drag an entry row onto another row in the same card to move it. Drag a role's handle onto another card — its model rows included — to move the role itself. To remove an entry, click the trash can icon on its row, or drag the entry back onto the **Models** column. To remove a role, click the trash can icon in the top right of its card. Removing your last role is allowed; the tab then reads `No roles yet.` and keeps an **Add role** button.

When adding a role, pressing `Enter` and then clicking away while the same name is still pending sends it only once. You can enter and submit a different name while that request is pending; it may be added independently. If the earlier request succeeds after you have typed a newer name, your newer draft and the **Add role** control stay in place.

If another edit changes the entry list before your removal, reorder, or effort change arrives, the tab shows the current choices and says `The entries of role "<name>" changed elsewhere — retry the edit on the current list. Nothing was written.` Retry using the refreshed list; the refused edit leaves the file untouched.

<img class="agent-float left" src="/agents/mahir-south-east.png" alt="" />

Renaming happens in place: click the name, type the new one, and press `Enter` or click away. `Escape` puts the old name back. The same goes for a description. Names are matched ignoring case, so two roles can never end up named `Review` and `review` — the second one is refused with `A role named "<name>" already exists.` and nothing is saved. A refused name stays in the field it was typed in, so you can fix the typo and commit again without retyping it. Numeric names such as `10` and `2`, and names such as `__proto__`, keep their descriptions, choices, and the order you give them.

## Use your roles with a project

Roles you write yourself live in `~/.janissary/roles.json` and are yours everywhere. Drop a `.janissary/roles.json` into a project and it **replaces** your home roles for that project entirely — nothing is merged, so a project either shows your project's roles or your home ones, never a mixture. The line above the cards always tells you which file you are looking at.

## Edit the file by hand

`roles.json` is a plain JSON object. Each key is a role name, and the keys keep the order you see in the tab. A role holds a `description` string and an `entries` list. Each entry names a `harness` and a `model`, and carries an `effort` only when you picked one:

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

An effort outside the dropdown's levels is kept as written. The tab drops three kinds of damage when it reads a hand-written file:

* A role that isn't an object with a `description` string and an `entries` list.
* An entry with no `harness` or no `model`, or with an `effort` that isn't a string.
* A role whose name is empty once trimmed, or matches an earlier role ignoring case.

Whenever the tab saves, it keeps the file's existing permissions. If a save fails, your previous file is left as it was.

## When something goes wrong

<img class="agent-float" src="/agents/idris-south-west.png" alt="" />

If the file in effect cannot be read, is not valid JSON, or is not an object of roles, the tab falls back — from a project file to your home file, and from a home file to the built-in defaults. It tells you in one line which file broke and what you are looking at instead, such as `roles.json is not valid JSON at <path> — showing default roles.` The other two openings are `roles.json could not be read at <path>` and `roles.json is not a set of roles at <path>`. The broken file is left exactly as it is. When the defaults are all you are looking at, the line above the cards reads `No roles file in effect`, and the tab refuses every edit with `roles.json at <path> is unusable — fix the file before editing roles.` so a fix you have not made yet is never overwritten. Once it has fallen back to a file that is whole, that file is the one you are editing: keep editing it, and the broken one still stays exactly as it is.

If only part of a file is damaged — one role, or one model entry — the rest opens and the line says how much was dropped, for example `roles.json dropped 2 malformed roles or entries at <path> — showing the rest of this file.` That file is still the one being edited, so edits are refused there too, with the same `is unusable` message, until you repair it by hand.

If no file exists and the tab can't create `~/.janissary/roles.json`, it shows the default roles with `roles.json could not be created at <path> — showing default roles.` Edits are refused the same way.

If you type a description while another window changes it, the newer saved description replaces your draft when the change reaches this tab. The tab reports `The description of role "<name>" changed elsewhere — nothing was written.` Review the saved text, then enter your change again.

You can always open the file itself in an editor if you would rather fix it by hand. The tab reads the file again every time you open it, so hand edits and tab edits can take turns without fighting.

If you add an argument to `roles`, such as `roles left`, the command reports `Usage: roles`. Run `roles` without an argument to open the tab.

## What roles don't do yet

A role is a saved list, and nothing reads it for you yet. No launch dialog, command flag, or agent looks up a role's description or choices, so picking a role doesn't start a harness. The file is there for you, or for a script or agent you point at it, to read. A choice stores a harness, a model, and an effort, and nothing else. Reordering also needs the mouse: adding and removing work without one, but order changes ride the drag.
