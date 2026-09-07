# Address a monitor by its runtime name everywhere the user and the UI name one

**Complexity: 6/10** — a rename that runs through the command grammar, the manager, the listing, the connections rows, the completion catalog, the reporting tab's payload, and its React body. Many files, but each edit is small and mechanical; no new subsystem, no persistence change, no wire method added.

## Goal

Make the name a user types the name the registry answers to, so a monitor started under a name of its own can be stopped and questioned like any other.

## Approach

`MonitorManager.start` keys `${owner}:${name}`, with `name` defaulting to the persona for the interactive `monitor` command and `startProfileMonitors` the one caller that passes a distinct one. Everything that reads the registry then diverges. `ask` looks up `${owner}:${personaName}` while `stop` keys by name. The command handlers hand `parsed.persona` to both. `listMonitors` prints `reg.persona.name`, and `monitorConnections` builds its row text from the persona while filling `acpRef.name` from the runtime name — the label and the thing it addresses disagree in the same object. Completion offers persona names for every monitor argument. And the reporting tab stores the runtime name in a field called `persona`, which the React body renders as the persona under a comment still asserting the two are always equal.

Nothing here is a rewrite; it is one word used in two senses. Rename the parsed field to `name` and carry it through the two command handlers, key `ask` on it the way `stop` already does, and point completion at the live monitor names for the arguments that address a running monitor — `unmonitor` and `monitor ask` — while `monitor <persona>` keeps completing personas, because that argument really does name a persona. Print the name in the listing and the connections row, with the persona beside it where it adds information. Carry both `name` and `persona` on the reporting tab's payload so its header can show each, and correct `start`'s duplicate message, which blames the persona for a collision that is really on the name.

`allocateMonitorLabel` in `src/monitor/window.ts` is exported and covered by tests but has no production caller left — the name-keyed registry replaced it — so it goes with the rest.

## Implementation steps

1. `src/monitor/parsing.ts` — rename the `persona` field to `name` on `ParsedMonitor`, `ParsedMonitorAsk`, and `ParsedUnmonitor`, and update the usage strings so they read `<name>` where the argument addresses a running monitor.
2. `src/commands/monitor.ts` and `src/profile/monitors.ts` — read `parsed.name`. The `monitor` command still passes it as the persona to `start`, because for that command the two are the same thing.
3. `src/monitor/manager.ts` — key `ask` on the name rather than the persona, and rewrite `start`'s duplicate message to name what actually collided.
4. `src/monitor/info.ts` — print `reg.name` in `listMonitors`, adding the persona beside it only when it differs, and build the connections row text from `reg.name` so it matches the `acpRef.name` already beside it.
5. `src/tab/types.ts` and `src/protocol/tab.ts` — add `name` to the monitor payload beside `persona`, and correct both doc comments.
6. `src/monitor/window.ts` — take the persona alongside the name in `makeMonitorTab`, `openMonitorTab`, and `pushSuggestion`, storing both; drop the stale comment asserting a reporting tab's label is always the persona; delete `allocateMonitorLabel`.
7. `src/completion/index.ts`, `src/completion/handlers.ts`, and `src/controller/completion.ts` — carry the live monitor names beside the personas, and offer them for the first argument of `unmonitor` and the second of `monitor ask`.
8. `web/src/MonitorTab.tsx` and `web/src/ReportingSection.tsx` — take the name and render it as the header's identity, with the persona shown beside it when it differs.

## Tests

- `src/monitor/manager.test.ts` already pins name-keyed starts — two monitors sharing a persona under different names, and a name collision across personas — alongside persona-keyed `ask` and "No … monitor running" cases. Move the latter onto names, and add a case that starts a monitor under a profile-style name and then both stops and questions it by that name, which is the failure the item describes.
- `src/monitor/window.test.ts` — delete the `allocateMonitorLabel` block with the function; update the reporting-tab payload assertions to carry both fields.
- `src/monitor/info.test.ts` (or the manager tests covering the listing and connections rows) — assert the listing and the connections row name the runtime name, and that a monitor whose name differs from its persona shows both.
- `src/completion/` tests — `unmonitor` and `monitor ask` complete live monitor names; `monitor <persona>` still completes personas.
- `web/src/MonitorTab.test.tsx` and `web/src/ReportingSection.test.tsx` — the header shows the name, and shows the persona beside it when they differ.
- Every existing case where name and persona coincide must keep passing unchanged; that is the whole interactive path.

## Spec updates

`product/specs/monitoring.md` — state that a monitor is addressed by its name, that the name defaults to the persona when `monitor` starts one, that a profile may give one a name of its own, and that `unmonitor`, `monitor ask`, the `monitors` listing, the connections row, and the reporting tab header all use that name.

## Docs

`help.md` — the `unmonitor` row and the Tab-completion paragraph both said persona where they meant the running monitor's name; both corrected in place, and the completion paragraph now states which argument draws from which catalog.

`documentation/user-documentation/automation/monitoring.md` — `monitor ask <persona>` corrected to `<name>`, the reporting-tab metadata description updated, the `unmonitor security` example reworded, and a short "How a monitor is named" section added covering the name/persona distinction that the rest of the page now depends on.

## Out of scope

- The `monitor <persona>` argument itself, which names a persona and continues to.
- Making a monitor's name settable from the interactive command; only a profile supplies a distinct one today.
- The reporting tab's label, which is already the runtime name.
