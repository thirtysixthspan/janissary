# Roles

Name what kind of work you are about to do once, and keep the model choices and commands for `ask` and `tell` beside the name.

```
roles
```

## Set up your roles

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

The tab opens with your role cards and the line above them names the file you are editing — `~/.janissary/roles.json`, or your project's own file when it has one. Add enabled harness/model choices and native commands for `ask` and `tell` from each card. To refresh or manage model choices, open the [Models tab](/user-documentation/tab-types/models).

A role has a name, a description, an ordered list of model choices, and native commands it makes available to `ask` or `tell` prompts. The description is plain text: write what the role is for, so you or an agent can tell `planning` from `research` at a glance. The `ask` and `tell` commands use their matching role; other roles remain saved choices for you, a script, or an agent to read.

If neither your project nor your home folder has a `roles.json` file, opening the tab creates seven roles for you: **planning**, **research**, **code review**, **implementation**, **documentation**, **ask**, and **tell**. Ask and tell start with the same three model choices. Ask can read a file from the workspace, list and query databases, browse to a page and read its content, and ask or approve a question. Tell starts with those commands plus database create/delete, browser eval, and writing and editing workspace files. The other five roles start without command grants; planning comes with two model choices, and the rest start without any. If either file already exists, the tab uses it instead and does not add the defaults; an existing roles file is not changed, so a saved tell keeps the grants it lists. A file holding just `{}` counts as a file: it means you chose zero roles, so the tab shows none.

## Add a model to a role

Each card has **Models** and **Commands** sections. Click **Add model** in the Models section, pick the harness, model, and effort, and press **Add**. The picker offers enabled models only. The effort picker starts on `default` and returns to it when you change the harness or reopen the picker, so a choice never carries over to an entry you did not make it for.

Each choice row carries an effort dropdown: `default`, `low`, `medium`, `high`, `xhigh`, or `max`. `default` stores no effort at all for that choice; the other levels are the same ones the **New harness** dialog offers. If a hand-written role has another effort value, that value stays visible as an option in its dropdown. Change it whenever you like: the tab saves as you go. If saving fails, it shows `Could not write roles.json at <path>.` and preserves your previous file and the choices on screen.

## Grant commands to a role

In the **Commands** section, choose **Add command**, select a native command, and press **Add**. The picker only offers commands the role does not already have. Remove a command with its **Remove `<command>`** control; removing a command removes every duplicate copy from the file. When all thirteen native commands are granted, **Add command** is hidden. A granted command that is currently disabled is dimmed and carries the tooltip `Disabled application-wide` when it is off everywhere or `Disabled for agents` when only its agent access is off; the grant stays in your roles file and the picker still offers the command.

The built-in **ask** role can read a file from the workspace, read and query databases, browse to a page and read its content, and ask or approve a question. Ask can read files but not change them. **Tell** inherits those commands, including reading a file, and can also create or delete databases, evaluate browser pages, and write and edit workspace files. You can adjust either list for your workflow. A role with an empty command list gives its prompts no native tools.

## Reorder and remove

Drag an entry row onto another row in the same card to move it. Drag a role's handle onto another card — its model rows included — to move the role itself. To remove an entry, click the trash can icon on its row. To remove a role, click the trash can icon in the top right of its card. Removing your last role is allowed; the tab then reads `No roles yet.` and keeps an **Add role** button.

If an entry names a model that is disabled or no longer in the catalog, it stays in your roles file and appears dimmed with the tooltip `Not in the model catalog`. Enable or restore the model through the [Models tab](/user-documentation/tab-types/models), or edit the entry by hand.

When adding a role, pressing `Enter` and then clicking away while the same name is still pending sends it only once. You can enter and submit a different name while that request is pending; it may be added independently. If the earlier request succeeds after you have typed a newer name, your newer draft and the **Add role** control stay in place.

If another edit changes the entry list before your removal, reorder, or effort change arrives, the tab shows the current choices and says `The entries of role "<name>" changed elsewhere — retry the edit on the current list. Nothing was written.` Retry using the refreshed list; the refused edit leaves the file untouched.

<img class="agent-float left" src="/agents/mahir-south-east.png" alt="" />

Renaming happens in place: click the name, type the new one, and press `Enter` or click away. `Escape` puts the old name back. The same goes for a description. Names are matched ignoring case, so two roles can never end up named `Review` and `review` — the second one is refused with `A role named "<name>" already exists.` and nothing is saved. A refused name stays in the field it was typed in, so you can fix the typo and commit again without retyping it. Numeric names such as `10` and `2`, and names such as `__proto__`, keep their descriptions, choices, and the order you give them.

## Use your roles with a project

Roles you write yourself live in `~/.janissary/roles.json` and are yours everywhere. Drop a `.janissary/roles.json` into a project and it **replaces** your home roles for that project entirely — nothing is merged, so a project either shows your project's roles or your home ones, never a mixture. The line above the cards always tells you which file you are looking at.

## Edit the file by hand

`roles.json` is a plain JSON object. Each key is a role name, and the keys keep the order you see in the tab. A role holds a `description` string, an `entries` list, and a `commands` list. Each entry names a `harness` and a `model`, and carries an `effort` only when you picked one. The command list contains the native commands that role can run through ACP:

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

An effort outside the dropdown's levels is kept as written. The tab drops three kinds of damage when it reads a hand-written file:

* A role that isn't an object with a `description` string and an `entries` list.
* An entry with no `harness` or no `model`, or with an `effort` that isn't a string.
* A role whose `commands` field is not a list of strings.
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

## Use ask and tell with roles

`ask <prompt>` asks the ask role's models to answer a question. `tell <prompt>` asks the tell role's models to carry out a task and report what they did. Each role's model order and command grants are read for every prompt. They keep separate conversations, so one ask and one tell prompt can run at the same time. Use `ask reset` or `tell reset` to start a fresh conversation for only that role. See [Query ACP from a shell](/user-documentation/advanced-agents/acp-agent) for prompt behavior and connection controls.

Roles other than **ask** and **tell** remain saved lists; choosing one does not launch a harness. Reordering roles or model choices uses drag and drop. Adding and removing roles, models, and commands can be done without a pointer.
