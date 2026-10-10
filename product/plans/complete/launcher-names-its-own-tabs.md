# Name the launcher's own tabs by what owns them, not by their label

**Complexity: 5/10** — one identity on the activity contract, one shared predicate, and three cases the label-based rule got wrong.

`isLauncherOwn` in `src/plugins/launcher/activate.ts` decides which tabs are the launcher's own by comparing a label: `tab.view === 'plugin' && tab.label === LAUNCHER_LABEL`. Both halves are assumptions about a label the host minted, and neither holds.

`uniquePluginLabel` in `src/tab/unique-labels.ts` hands a plugin tab the first free label from its prefix, so the launcher's own tab is `launcher` only while nothing else holds that name — otherwise it is `launcher-2`, which the check does not recognise. And the label is not the launcher's to reserve: `zsh launcher` opens a shell named `launcher`, and a plugin tab with any other owner can hold the name while the launcher is docked. The same two-sided failure runs the other way too: an undocked launcher is not excluded by any dock test, because the only rule that mentions it is the label one.

The summary flush inherits the label rule and adds a second gap of its own. `summarizedTabs` asks for transcript tails on every tab the launcher does not own, which includes every docked tab — a docked tab is never in the centre strip, is never what a user is working on, and is exactly the kind of tab whose transcript is a UI artefact rather than work.

## Goal

The launcher names its own tabs by ownership, on both the pull and the push path, and the summarizer reads centre tabs only.

## Approach

1. **`src/plugins/activity.ts`** carries which plugin owns a tab on `TabActivityEntry`: the declaration id and the instance key it was opened with, present for a plugin tab and absent otherwise. It is the host's own record of the thing, and it is the only part of a tab's identity a plugin can already speak — a plugin knows the instance keys it opens with.
2. **`src/plugins/launcher/shared.ts`** takes the predicate, because two modules need it and it must be one rule. It asks whether the row is a plugin tab opened under the launcher's own singleton key, and it no longer looks at a label.
3. **`src/plugins/launcher/payload.ts`**'s `toRows` drops the launcher's own tabs beside the docked ones, so the push path — the `tabs` topic handing over every open tab — cannot put the launcher's own row into the payload when it is undocked.
4. **`src/plugins/launcher/activate.ts`** reads for display through the same projection and reads for the summarizer through a filter that also drops docked tabs, because a flush asks about work in the centre strip.

### Rejected alternatives

- Keeping the label check and adding the instance key beside it. It leaves the wrong-half failure in place: a shell named `launcher` is still not the launcher, and the label half is what gets that wrong.
- Reserving the `launcher` label so nothing else can take it. A label is minted from the agent-name pool on demand; reserving one is a naming rule the pool does not have and the launcher does not need.
- Having the host exclude the caller's own tabs inside `tabActivity`. The `tabs` topic is read once for every subscriber, so a per-caller exclusion would not reach the push path, and the payload projection needs the same rule anyway.

## Implementation steps

1. Carry the owning plugin on `TabActivityEntry` and fill it in the reader.
2. Move the ownership predicate into `shared.ts`, keyed on the instance key.
3. Drop the launcher's own tabs in `toRows`, and drop docked tabs from the summarizer's read.
4. Add the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/plugins/launcher/activate.test.ts`: an undocked launcher tab — no dock side, the launcher's instance key — appears in neither the payload nor the flush.
- Another tab already named `launcher`, with no plugin record, is shown and summarised like any other centre tab.
- A docked tab belonging to another plugin is neither shown nor summarised, while its row still reaches the payload path so the filter is what drops it.
- The payload never carries the launcher's own row through the `tabs` topic, which is the push path.

## Spec updates

- `product/specs/launcher.md`: the launcher names its own tabs by ownership rather than by label, and a flush summarises centre tabs only.

## Out of scope

- Whether a label should be reserved for a plugin's own tab. That is a naming question for the pool, not a launcher one.
- A docked tab appearing in the summary for a launcher that is itself docked. A flush has no docked inputs at all now.
