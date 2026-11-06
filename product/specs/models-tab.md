# Models tab

The Models tab shows the effective model catalog by provider. It reads the catalog and refresh state from the host's `models` topic, so a Delete or completed Refresh updates every open Models view and the other model consumers without restarting Janissary.

### Command and layout

`models` opens or focuses the singleton Models tab. `models left` and `models right` dock it in the named sidebar. Running bare `models` while it is docked returns it to the center. Any other argument is refused with `Usage: models [left|right]`.

The center table has Model, Name, Harness, and actions columns. Docked rows stack the model id and its actions above the name and harness. A missing model name falls back to the id. The Refresh action is in the metadata row beside the host split or dock-cycle control. While a refresh is active, the Refresh icon spins and the button is disabled. A refresh starts only when the user presses the button.

Models are grouped in catalog order. The `claude` group is headed `Anthropic`; `codex` is headed `OpenAI`. OpenCode ids are grouped by the prefix before `/`: `opencode` is headed `OpenCode Zen`, `opencode-go` is headed `OpenCode Go`, `google` is headed `Google`, and `openai` is headed `OpenAI`. An OpenCode id without `/` uses the `opencode` prefix and `OpenCode Zen` heading. Any other prefix is shown as its raw heading. A new prefix appears after existing OpenCode groups when Refresh appends it. The two `OpenAI` groups remain distinct by their Harness column.

Hidden records do not appear in the Models tab. Disabled records stay visible, are dimmed, and have no Delete control. An empty visible catalog reads `No models` without column headings.

### Catalog file and changes

The bundled catalog is `known-models.json` at the repository root. A project override at `.janissary/known-models.json` replaces it wholesale. Missing or invalid overrides use the bundled catalog with the warning described in [Harness Tab](harness.md#what-the-bundled-catalog-holds). The file maps harness names to ordered model records containing an `id`, an optional `name`, and optional `disabled` and `hidden` flags.

The catalog is re-read when `models` runs and at the start of Delete and Refresh. Hand edits therefore take effect at the next of those actions; this version does not watch the file continuously. A read that finds a changed catalog replaces the in-memory value and updates open consumers.

### Delete

Deleting asks first through `ConfirmDialog`, with title `Delete <model id>?` and button `Delete`. Confirming sets both `disabled` and `hidden` to `true` on the record and writes the complete effective catalog to the project override. The record is never removed. A deleted model cannot be restored in the tab; clear its flags in `.janissary/known-models.json` by hand.

Delete is available only for a visible, enabled record. If the record became unknown, hidden, or disabled while its confirmation dialog was open, the manager refuses the action with `no model "<harness> <id>"`. The Models tab shows the refusal in a dismissible `Delete failed:` alert after the confirmation closes. A write failure is reported through the refresh notification instead of as a refusal.

### Refresh

Refresh queries the providers concurrently, with a 30-second timeout for each source:

- **OpenCode** runs `opencode models` and reads one `<provider>/<model>` id per line. It keeps every reported provider. OpenCode lists only providers configured on the current machine.
- **Codex** runs `codex debug models`. It keeps entries whose `visibility` is `list`, maps `slug` to `id`, and maps `display_name` to `name`.
- **Claude** lists pages from `GET https://api.anthropic.com/v1/models` using `ANTHROPIC_API_KEY`, mapping `id` and `display_name` to the corresponding record fields. Without the key, the Claude provider is skipped.

The merge syncs each reached provider. It appends new ids in provider order, updates fetched names, retains flags on listed ids, and drops ids that a reached provider no longer reports. A provider that could not be reached keeps its existing list. OpenCode prefixes already in the catalog but not reported by this machine are treated as unconfigured and kept unchanged. If no harness was reached, Refresh writes nothing.

Refresh reports one line in the notifications feed through the `models-refresh` event. The event has its own default-on toggle, bypasses focus suppression, and uses the success alert default; see [Notifications](notifications.md). When at least one harness was reached, the line starts `Models refreshed:`. Otherwise it starts `Models not refreshed:`. Reached harnesses come first in the order Claude, Codex, OpenCode. Each shows its visible count after merge, followed by nonzero added and removed counts in parentheses. Skipped or failed harnesses follow in that same order, then each unreported OpenCode prefix in catalog order as `<prefix> skipped: not configured in opencode.`.

Examples:

- `Models refreshed: codex 12 (+1 −2), opencode 29 (+3). claude skipped: ANTHROPIC_API_KEY is not set.`
- `Models not refreshed: claude skipped: ANTHROPIC_API_KEY is not set. codex failed: timed out after 30 s. google skipped: not configured in opencode.`

A missing CLI reads `<harness> skipped: <binary> is not installed.` A timeout reads `<harness> failed: timed out after 30 s.` Other failures use the first line of the error. A failed catalog write reports `Could not write known-models.json at <path>.` and leaves the file and in-memory catalog unchanged.

The Models view receives manager changes through the `models` topic, whose data contains visible groups and the `refreshing` flag. The Refresh result notification is separate from the topic delivery, so the icon stops spinning when the manager clears the flag and every open Models view repaints from the updated catalog.
