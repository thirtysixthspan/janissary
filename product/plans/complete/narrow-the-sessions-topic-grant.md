# Narrow the sessions topic grant to the row that offers the verb

Issue: the sessions topic lets a plugin close any tab whose label appears in a recorded row.

Complexity rating: 4/10

## Goal

`actOnSessions` admits `focus`, `close`, and `detach` whenever `SessionsManager.holds({ label })` is true, and `holds` returns true when *any* row carries that label — including a `detached` or `ended` row, whose `label` is a recorded name belonging to no live tab. So a plugin declaring the `sessions` topic can send `{ topic: 'sessions', action: 'close', label: '<recorded label>' }` and `SessionsManager.close` resolves it through `TabManager.findIndex` and closes whatever tab currently bears that name — even though the row that authorised it offers only `reattach`.

The grant is wider than the list that motivates it, which is the property the topic's own comment in `src/plugins/api.ts` states: "Every one is refused when it names something the topic's current data does not hold." Recorded labels are ordinary harness names like `claude`, so the collision is likely rather than contrived, and a closed agent tab with its unsaved terminal state is the visible result.

## Approach

**Authorise on the row, not on the name.** `holds` is replaced by `offers(verb, target)`, which answers true only when a row both matches the target and lists that verb in its `actions` — the list the manager itself composed and already publishes to the client. Every arm of `actOnSessions` passes its own verb.

That is a real narrowing beyond the reported defect. `rows.ts` puts `close` only on a joined or ssh row and `detach` only on a launching one, so a plugin can no longer close a launching row's tab or detach a joined one either — both of which `holds` admitted and neither of which the list offers.

**Act on the row that matched.** The label arms currently resolve the tab through a second `findIndex` lookup, which is how a recorded label reached a live tab in the first place. `offers` returns the matched row, so the manager acts on `row.label` — the same string, but arrived at through the row that authorised it rather than through a fresh search of the tab table.

`focus` and `close` take the row so the seam is explicit; `detach` needs no change beyond the narrowing, since it already resolves its entry through `RemoteManager`'s own table rather than through the tab list.

**Keep the client-side check.** `actOnRow` in `src/plugins/sessions/activate.ts` already applies this rule and stays as defence in depth. The host must not depend on it: any plugin declaring the topic reaches `actOnSessions` directly, without going through the bundled plugin's client entry at all.

## Implementation steps

1. In `src/sessions/manager.ts`, replace `holds` with `offers(verb, target)` returning the matched row or undefined, and have `focus` and `close` take the row they were authorised by.
2. In `src/plugins/topics.ts`, have every arm of `actOnSessions` pass its verb and act on the returned row.
3. Update the topic's comment in `src/plugins/api.ts` to state the actual rule — a verb the named row offers — rather than mere presence in the data.

## Tests

In `src/plugins/topics.test.ts`, beside the existing refusal case for an action naming an unknown row:

- An action naming a row that does not offer that verb is refused, driven through the row set the manager reports rather than through a hand-written predicate.

In `src/sessions/manager.test.ts`:

- A `close` aimed at a detached row's label leaves a live tab of the same name open — the defect itself, stated as the collision it is.
- A `close` aimed at a joined row's label still closes that tab, so the narrowing has not broken what the list offers.
- `offers` refuses `detach` on a joined row and `close` on a launching row, which is the rule `rows.ts` composes.

## Out of scope

- The two addressing modes, which stay as they are: `reattach`, `end`, and `forget` are keyed by session id and already cannot name a tab.
- `focusOwner` and the other topics' narrowing, which are unrelated grants.
- The client-side check, which stays exactly as it is.

## Specs and docs

- `product/specs/plugins.md` (or whichever spec covers topic actions): checked at implementation time and extended only if it states the narrowing rule.
- `help.md` and `documentation/user-documentation/`: checked at implementation time; the topic is a plugin-facing contract, not user-facing behavior.
