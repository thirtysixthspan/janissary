# Attribute session action notifications to the sessions tab when it is open

Complexity: 2/10

## Goal

Plan item 12 states the `remote-session` lines are "attributed to the sessions tab when it is open
and to the active tab otherwise", but `report` in `src/sessions/actions.ts` always passes
`managers.tab.cur().label` to `notify`, so with the sessions tab open but not focused, a detach
raised from a metadata row is attributed to whatever tab the user happens to be reading.

## Approach

Resolve the attribution once per report: the open sessions plugin tab's label when it is open (the
tab carrying the plugin's id — the same open-or-reuse identity `pluginTabByInstanceKey` resolves
from), falling back to `managers.tab.cur().label` when there is none.

## Implementation steps

1. `src/sessions/actions.ts` — resolve the attribution in `report`: a tab whose `plugin.id` is the
   sessions plugin's id, else the active tab's label.

## Tests

`src/sessions/manager.test.ts` — a detach with the sessions tab open but another tab active
attributes the line to the sessions tab. The provenance formatting pins in
`src/notifications.test.ts` keep passing; the existing refusal assertions (no sessions tab) keep
resolving to the active tab.

## Documentation

One sentence in `product/specs/sessions-tab.md`'s reporting section, so the attribution is
documented rather than incidental.

## Out of scope

- Provenance formatting itself (`notifications.ts`).
- The other narrators (`reattachTab`'s refusal names the tab it was raised from, deliberate).
