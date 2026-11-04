# Surface a refused connection-list close on an open ACP record row

## Complexity

2/10 — one branch in the connections activation and two focused test additions. The topic refusal and the client alert path already exist.

## Goal

The connections list's **Close** control on an open ACP record row sends a `close` intent that the activation turns into a `closeSession` topic action. The activation discards the topic's refusal, so a record whose owning tab no longer holds it, or whose status moved on, ends the intent successfully and the list's inline `role="alert"` never appears. Forward that refusal through `rejectRequest` so the existing controller alert shows it and the record and its tab stay unchanged.

## Approach

In `src/plugins/connections/activate.ts`, delegate the open ACP record branch of `openOrClose`'s `close` case to the existing `recordAction('close-session', row.id, capabilities)` helper, which already captures the topic's returned string and passes a non-`undefined` value to `capabilities.rejectRequest`.

Keep the rest of the branch as it is: a live row's close stays a fire-and-forget topic action, and a row that is missing or is not an open ACP record keeps the `invalid close payload` rejection. Do not touch `recordAction`'s other branches, the record-tab Cancel/Close session/Terminate paths, the list Delete path, or `actOnLive`'s silent no-op behavior.

## Implementation steps

1. Change the open ACP record branch in `openOrClose` in `src/plugins/connections/activate.ts` to return `recordAction('close-session', row.id, capabilities)`.
2. Add a case to `src/plugins/connections/activate.test.ts` with a current open ACP record row whose `closeSession` topic action returns `The owning tab no longer holds this record.`; assert the intent throws that message and `rejectRequest` receives it.
3. Add a case to `web/src/plugins/connections/ConnectionList.test.tsx` where Close on an open ACP record row rejects with that message; assert the refusal appears in `role="alert"` and the Close intent names the row.
4. Update `product/specs/connections-tab.md` so the list's refused-close sentence covers a record that has closed and one whose owning tab no longer holds it.
5. Run `$janissary/scripts/run.mjs check-diff` after each change.

## Tests

- `src/plugins/connections/activate.test.ts`: an open ACP record close whose topic action returns a refusal throws the message through `rejectRequest` and sends the `closeSession` action for that record id.
- `web/src/plugins/connections/ConnectionList.test.tsx`: a refused Close on an open ACP record row shows the message in the existing inline alert.

## Spec

Update `product/specs/connections-tab.md`: an open ACP row's Close is refused inline and changes nothing when the record has since closed or its owning tab no longer holds it.

## Docs

None needed: no command, flag, key binding, or user-documentation page describes the list's inline refusal.

## Out of scope

- Changing the record tab's Cancel, Close session, or Terminate paths.
- Changing the list's Delete path or its confirmation dialog.
- Changing live-row open and close behavior or `actOnLive`'s silent no-op.
- Changing command close paths, topic payloads, or wire shapes.
