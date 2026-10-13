# Roles

Name what kind of work you are about to do once, and keep the model choices that suit it beside the name.

```
roles
```

## Set up your roles

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

The tab opens in the center strip with two columns. **Models** on the left lists every harness you can launch and the models each one knows. Your roles sit on the right, and the line above them names the file you are editing — `~/.janissary/roles.json`, or your project's own file when it has one.

A role has a name, a description, and an ordered list of choices. The description is plain text: write what the role is for, so you or an agent can tell `planning` from `research` at a glance.

The first time you open the tab it writes five roles for you: **planning**, **research**, **code review**, **implementation**, and **documentation**. Each one starts with a description and no model choices, except **planning**, which comes with two. Edit them freely — nothing depends on the defaults after that.

## Add a model to a role

Drag a model from the **Models** column onto a role card and it becomes that role's next choice. Drop it anywhere on the card — on one of its existing model rows, or on the controls there, as much as on the empty space around them. Every drop adds, so if you drop the wrong one, remove it and drag the right one in.

Without a mouse, click **Add entry** on the card, pick the harness, the model, and an effort, and press **Add**. The effort picker starts on `default` and returns to it when you change the harness or reopen the picker, so a choice never carries over to an entry you did not make it for.

Each choice row carries an effort dropdown: `default`, `low`, `medium`, `high`, `xhigh`, or `max`. `default` stores no effort at all and leaves the harness on its own default; the other levels are the same ones the **New harness** dialog offers. Change it whenever you like: the tab saves as you go. If saving fails, it shows `Could not write roles.json at <path>.` and preserves your previous file and the choices on screen.

## Reorder and remove

Drag an entry row onto another row in the same card to move it. Drag a role's handle onto another card — its model rows included — to move the role itself. To remove an entry, click its **×**, or drag the entry back onto the **Models** column. To remove a role, click the **×** on its card. Removing your last role is allowed; the tab then reads `No roles yet.` and keeps an **Add role** button.

If another edit changes the entry list before your removal, reorder, or effort change arrives, the tab shows the current choices and says `The entries of role "<name>" changed elsewhere — retry the edit on the current list. Nothing was written.` Retry using the refreshed list; the refused edit leaves the file untouched.

<img class="agent-float left" src="/agents/mahir-south-east.png" alt="" />

Renaming happens in place: click the name, type the new one, and press `Enter` or click away. `Escape` puts the old name back. The same goes for a description. Names are matched ignoring case, so two roles can never end up named `Review` and `review` — the second one is refused with `A role named "<name>" already exists.` and nothing is saved. A refused name stays in the field it was typed in, so you can fix the typo and commit again without retyping it. Numeric names such as `10` and `2`, and names such as `__proto__`, keep their descriptions, choices, and the order you give them.

## Use your roles with a project

Roles you write yourself live in `~/.janissary/roles.json` and are yours everywhere. Drop a `.janissary/roles.json` into a project and it **replaces** your home roles for that project entirely — nothing is merged, so a project either shows your project's roles or your home ones, never a mixture. The line above the cards always tells you which file you are looking at.

## When something goes wrong

<img class="agent-float" src="/agents/idris-south-west.png" alt="" />

If the file in effect cannot be read or is not valid JSON, the tab falls back — to your home file, and failing that to the built-in defaults — and tells you in one line which file broke and what you are looking at instead. The broken file is left exactly as it is, and while nothing at all decodes the tab refuses edits until you fix it, so a fix you have not made yet is never overwritten. Once it has fallen back to a file that is whole, that file is the one you are editing: keep editing it, and the broken one still stays exactly as it is.

If only part of a file is damaged — one role, or one model entry — the rest opens and the line says how much was dropped. That file is still the one being edited, so edits are refused there too until you repair it by hand.

If you type a description while another window changes it, the newer saved description replaces your draft when the change reaches this tab. The tab reports `The description of role "<name>" changed elsewhere — nothing was written.` Review the saved text, then enter your change again.

You can always open the file itself in an editor if you would rather fix it by hand. The tab reads the file again every time you open it, so hand edits and tab edits can take turns without fighting.

If you add an argument to `roles`, such as `roles left`, the command reports `Usage: roles`. Run `roles` without an argument to open the tab.
