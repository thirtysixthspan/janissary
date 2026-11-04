# Surface refused record-tab lifecycle actions

## Complexity

3/10 — one topic action module, one plugin intent helper, focused tests, and a spec sentence. The wire, payloads, and the existing alert path are unchanged.

## Goal

A record-tab Cancel, Close session, or Terminate, and a list Delete, currently ignore a record that moved on for a valid id: the topic action returns nothing, so the plugin intent completes and the inline `role="alert"` never appears. Return a concise, user-facing refusal from the connections topic when a lifecycle action is no longer eligible, and propagate it through `rejectRequest` so the existing controller alert shows it. The record and its controls stay unchanged on refusal. Live-row open and close targets that stop matching stay silent no-ops, as do open-record lookups, because the list and popup already validate those against current data before dispatch.

## Approach

In `src/plugins/connections-topic-actions.ts`, return a string from the lifecycle branches that cannot act:

- `delete` returns `An open record cannot be deleted.` for an open record and `The record no longer exists.` for a missing record, including when the record manager's delete answers false.
- `cancel` returns `Only a running record can be cancelled.` when the record is not `Running`.
- `closeSession` returns `Only an open record can be closed.` when the record is neither `Running` nor `Idle`.
- Both core actions return `The owning tab no longer holds this record.` when the owning tab is missing or no longer carries the record id.
- `terminate` returns `The run is no longer live.` when the record is not a live agent run.

Successful lifecycle actions still return `undefined`; `load` and `loadOlder` keep returning `undefined`. `actOnLive` keeps its current silent-no-op behavior for a stale open or close target, and the `open-record` lookup in the plugin activation keeps rejecting only a payload whose current row is missing or not a record.

In `src/plugins/connections/activate.ts`, capture the string `capabilities.topicAction(...)` returns for `cancel`, `close-session`, `terminate`, and `delete`, and pass a non-`undefined` value to `capabilities.rejectRequest`. The `load-older` default branch keeps ignoring the topic answer and returns `null`.

## Implementation steps

1. Return refusal strings from `actOnRecord`, `actOnCoreRecord`, and `actOnAgentRecord` in `src/plugins/connections-topic-actions.ts`; return each result from `connectionsTopicAction` instead of discarding it.
2. Propagate a returned refusal through `rejectRequest` in `recordAction` in `src/plugins/connections/activate.ts`.
3. Extend `src/plugins/connections-topic.test.ts` with refusal returns for each lifecycle action, asserting the manager was not called and the record row is unchanged; keep assertions that successful actions and stale live-row targets return `undefined`.
4. Extend `src/plugins/connections/activate.test.ts` with a topic refusal for each lifecycle intent, asserting `rejectRequest` receives the message and the intent throws; leave the `load-older` intent returning `null`.
5. Extend `web/src/plugins/connections/ConnectionTab.test.tsx` with refused Cancel and Close session intents, asserting the alert shows the message, the record still reads `Running`, and both controls remain available.
6. Update `product/specs/connections-tab.md`: a refused lifecycle control shows its error and changes nothing, while a stale live-row open or close target is a no-op rather than a refusal.
7. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- `src/plugins/connections-topic.test.ts`: cancel on an idle record, closeSession on a completed record, either action with a stale owning tab, terminate on a non-live run, delete on an open record, and delete on a missing record each return their message and leave the manager calls and rows untouched. Running cancel, open closeSession, live terminate, and closed-record delete still return `undefined` and act. Stale live-row open and close still return `undefined` without acting.
- `src/plugins/connections/activate.test.ts`: each lifecycle intent whose topic action returns a message throws that message through `rejectRequest`; `load-older` stays `null` even when the topic answers.
- `web/src/plugins/connections/ConnectionTab.test.tsx`: a refused Cancel and a refused Close session show their message in the alert and leave the `Running` record and both controls in place.

## Spec

Update `product/specs/connections-tab.md` to distinguish a refused record lifecycle control from a stale live-row target.

## Docs

None needed: no command, flag, key binding, or user-documentation page describes the refusal behavior being surfaced.

## Out of scope

- Adding new controls or changing when Cancel, Close session, Terminate, or Delete appears.
- Changing the list's existing owner validation for open and close, or the popup's open-record lookup.
- Changing command close paths, the connections topic payload, or any wire shape.
