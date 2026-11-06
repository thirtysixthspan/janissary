### models

Open the model catalog, where you can refresh provider lists or hide and disable models.

**Usage**

`models`

`models left`

`models right`

**Use cases**

- Review models grouped by provider.
- Refresh provider lists and see the result in notifications.
- Hide and disable a model that should no longer be offered.

**Examples**

- `models` opens the catalog, or brings a docked catalog back to the center.
- `models left` docks it on the left; `models right` docks it on the right.

The catalog shows Model, Name, Harness, and actions. A missing name uses the model id. Hidden models are not shown. A disabled model that is not hidden stays visible but dimmed and cannot be deleted again.

Press **Refresh** to update models from the configured providers. A notification starts with `Models refreshed:` when a provider was reached, or `Models not refreshed:` when none were. The catalog is written only when at least one provider was reached. The notification lists each provider's visible model count and any skipped or failed provider. OpenCode prefixes that are not configured on this machine are kept and reported as `<prefix> skipped: not configured in opencode.`

Deleting a model asks for confirmation, then marks it disabled and hidden in `.janissary/known-models.json`; the row disappears, but the record stays in the file. An unavailable model remains in `roles.json`, where the Roles tab marks it `Not in the model catalog`. To restore a deleted model, clear its `disabled` and `hidden` flags in the override file.

If a confirmation is open for a model that became unavailable, Delete reports `no model "<harness> <id>"`. If saving the catalog fails, the notification reads `Could not write known-models.json at <path>.` A model launch rejected by the catalog reads `Unknown model "<model>" for harness "<name>" — add it to known-models.json.`

Any other command argument is refused with `Usage: models [left|right]`.
