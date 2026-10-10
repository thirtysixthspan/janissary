# Draw the sessions row's diff button disabled while the workspace provisions

**Complexity: 4/10** — one server line stops dropping the verb, one client expression stops making an exception for it, and the spec and its two tests move with them. No new capability, no route change.

The plan's product decision states the sessions row's diff button "is disabled while the channel's workspace is still provisioning", but `liveActions` in `src/sessions/rows.ts` omits the `diff` verb for a channel that has not landed its workspace, so the button is absent for the whole provisioning window rather than present and unpressable, and `product/specs/sessions-tab.md`'s **Diff** paragraph was written to match the absence. A reader comparing the spec to the plan has to work out which of the two is the decision.

## Goal

A sessions row carries its diff button from the moment it appears, unpressable while its workspace is still landing and pressable once it has, exactly as `detach` already behaves on a provisioning row. The `ssh`, detached, and terminated rows keep not carrying it at all — those are a different thing from a wait.

## Approach

`channelReady(channel)` is `channel.workspace !== ''`, and `src/sessions/snapshot.ts:55` derives `provisioning` from the same fact (`entry.workspaceDir === undefined`), so the two are one test read twice. Dropping the parameter and letting the row's state carry the wait is therefore not a new judgement — it is the same judgement reported once, to the component that already renders the wait. The host-side grant in `src/plugins/host.ts` stays as it is, so the widened offer never becomes a second place a provisioning diff can actually run: `openSibling` returns for a workspace still provisioning, and a remote row's own `openSibling` route already returns early for a tab whose `workspace` has not answered.

## Implementation steps

1. `src/sessions/rows.ts` — `liveActions` keeps `diff` on every live row instead of consulting readiness, drops its `ready` parameter, and the now-unused `channelReady` helper beside it goes. The `terminable` argument's derivation is untouched.
2. `web/src/plugins/sessions/SessionRowActions.tsx` — the `disabled` expression stops special-casing `detach` alone and names a `diff` button on a `provisioning` row as well, beside the in-flight case it already carries.
3. `product/specs/sessions-tab.md` — the **Diff** paragraph's "absent on a channel still provisioning" becomes the disabled treatment the plan records.
4. `documentation/user-documentation/tab-types/sessions.md` — the same sentence, in the user documentation's own words.
5. `src/sessions/rows.test.ts` — the `offers no diff on a row whose workspace has not landed` case becomes the inverse: the verb is offered and the row's state is what keeps it unpressable.
6. `web/src/plugins/sessions/SessionList.test.tsx` — the client test beside the row action list asserts the button is drawn disabled while the row's state is `provisioning` and enabled once it is `active`, in both the table and the docked layout.

## Tests

- `src/sessions/rows.test.ts` — the reworked `offers no diff` case, asserting `diff` is in the launching row's and the joined row's actions while the channel has no workspace.
- `web/src/plugins/sessions/SessionList.test.tsx` — the button is drawn disabled while the row's state is `provisioning` and enabled once it is `active`, in the table layout and the docked one.

## Documentation

- `documentation/user-documentation/tab-types/sessions.md` — **Show diff in the workspace** appears on every row of a live connection and is unpressable until the workspace has landed, rather than appearing once it has.

## Out of scope

- The `ssh`, detached, and terminated rows' action lists, which stay absent exactly as they are.
- `src/plugins/host.ts`'s `openSibling` guard, which already covers the widened offer.
- The metadata row's own button, which keeps its host-side guard.
