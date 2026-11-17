# Models

Use `models` to review the models your project can launch, refresh provider lists, or disable a model you no longer want to offer.

```
models
models left
models right
```

Bare `models` opens the catalog in the center, or returns a docked catalog there. Add `left` or `right` to dock it in a sidebar. See [Tabs](/user-documentation/getting-started/tabs) for how sidebars work.

<img class="agent-float" src="/agents/ahmed-south-east.png" alt="" />

## Browse the catalog

Models are grouped by provider under a friendly heading. Claude models appear under **Anthropic** and Codex models under **OpenAI**. OpenCode models are split by the prefix before the `/` in their id: `opencode` appears under **OpenCode Zen**, `opencode-go` under **OpenCode Go**, `google` under **Google**, and `openai` under **OpenAI**. An OpenCode id with no `/` uses **OpenCode Zen**, and any other prefix becomes its own heading. The two **OpenAI** groups stay separate; the Harness column tells them apart.

The table shows the model id, its display name, the harness that uses it, and its actions. Missing names fall back to the model id. In a docked catalog, each row stacks its id and actions above its name and harness. If no models are visible, the catalog reads `No models` without column headings.

Hidden models do not appear in the catalog. Disabled models that are not hidden remain visible in a dimmed row; they are no longer offered by harness launches, completion, role choices, or conversations. A role that still names a disabled or removed model stays in your roles file; its entry is dimmed with the tooltip `Not in the model catalog`.

<img class="agent-float left" src="/agents/tahir-south.png" alt="" />

## Refresh provider lists

Press **Refresh** to fetch the latest models from the providers configured on your machine. The icon spins while the refresh runs. When it finishes, the catalog updates and a line appears in the [notifications](/user-documentation/tab-types/notifications) feed, even when it is closed.

The line starts with `Models refreshed:` when at least one provider was reached. It starts with `Models not refreshed:` when none were. Reached providers show the visible model count and nonzero additions or removals; skipped or failed providers follow. If OpenCode does not report a provider already in your catalog, that prefix is kept and the line says `<prefix> skipped: not configured in opencode.`

If Claude is skipped because no API key is available, the line says `claude skipped: ANTHROPIC_API_KEY is not set.` If a provider's command is missing, the line says `<harness> skipped: <binary> is not installed.` A provider timeout says `<harness> failed: timed out after 30 s.` Any other failure shows the first line of the error. A failed catalog write says `Could not write known-models.json at <path>.` and leaves the saved catalog as it was before the attempted write.

## Delete a model

Use the trash button on a visible, enabled row. Confirming sets `disabled` and `hidden` to `true` on that model; it does not remove the record. Janissary writes the effective catalog to the project's `.janissary/known-models.json`, creating the file when needed. If two records share an id, Delete changes only the first one and leaves the duplicate as it was.

A model you delete is no longer offered for that harness. Its saved role entry remains, marked `Not in the model catalog`. To restore it, clear its `disabled` and `hidden` flags in `.janissary/known-models.json` by hand. If a model became unavailable while its confirmation was open, the tab shows a dismissible alert such as `Delete failed: no model "<harness> <id>"` and leaves the file unchanged.

## Edit a project catalog

The bundled `known-models.json` supplies the starting catalog. A project file at `.janissary/known-models.json` replaces the bundled catalog for that project. It maps harness names to ordered model records; each record has an `id` and can have a `name`, `disabled`, or `hidden` field. Each record is checked on its own, so a duplicate id is accepted and both rows appear in the catalog.

Hand edits take effect the next time you run `models`, confirm a Delete, or start a Refresh. Janissary does not watch the file continuously. A missing or invalid project override falls back to the bundled catalog with a warning; the next Delete or Refresh can replace an invalid override with the bundled catalog plus the requested change.
