# Running marker and link lifecycle in the shell reply writers
**Complexity: 4/10** — the decision core of the feature: a per-terminal map from reply id to the markers on its echo rows, settled three ways (link in place, link on the original and the repeated echo, removal), with marker registration that completes asynchronously and can lose a race with the reply.

## Goal

Teach `useShellReplyWriters` to add a running marker to an ACP echo, to turn it into a link when the reply settles with a record, to put the same link on a repeated command line, and to remove it when the reply settles without a record. Give `useShellTerminal` the per-attach state and the two options this needs. No caller passes a receipt or a reply yet, so the running app is unchanged until `07-client-wiring`.

## Design decisions and dependencies

Source plan requirements carried here: "Shell client changes" bullets on `useShellReplyWriters.ts` (the map of running markers, `echoCommand(line, receipt?)`, `displayReply(line, markdown, reply?)`), on `useShellTerminal.ts` (a fresh map each time a terminal attaches, `openConnectionRef` set from an `openConnection` option), and on the two click payloads; "While the prompt runs" (a click opens the role's live session, which follows a model fallback because the click names the role and the server resolves it at click time; a click before a record exists does nothing); "Once the prompt settles" (every echo of the line carries the link, the original echo's marker turns into the link in place, a second echo carries the same link, a refusal's marker is removed with nothing in its place, a reply that arrives before its echo gets none); "Edge cases" (a re-attached terminal starts empty; an `ask` and a `tell` at once each keep their own; the same line twice settles each marker by id, never by text; clicking a link after its record is gone does nothing and the link stays); "UI design" States and the Accessible name and tooltip; the `useShellReplyWriters.test.ts` entry in "Tests".

This subplan consumes:

- From `02-dispatch-receipt`: the `ShellAcpReceipt` type (`replyId`, `role`, `name`) from `@shared/plugins/shell/shared`, type-only.
- From `03-reply-record-and-tell-line`: a reply may carry `record: { id, name }`, and a reply's `id` equals the receipt's `replyId`.
- From `04-marker-decoration`: `addThinkingMarker(terminal, marker, view)` with `show(view)` and `remove()` on its handle, and the `ThinkingMarkerView` shape `{ kind: 'running' | 'link', name, onOpen }`.
- From `05-reply-writers-plumbing`: `useShellReplyWriters.ts` with the two moved writers; `writeShellEcho(…, onMarker?)` returning whether it wrote the echo and handing back the echo row's marker; `writeShellReply(…, onHeadMarker?)` returning whether it wrote its own line and handing back that line's row marker.

Decisions:

- Per-attach state. `useShellReplyWriters.ts` exports a small holder and a factory for it: a map from reply id to a marker entry, and a set of reply ids already written. `useShellTerminal` keeps the holder in a ref and replaces it with a fresh one next to `placementRef.current = placement`, each time a terminal attaches, so a re-attached terminal starts with none, as the screen itself does. xterm disposes markers and decorations with the terminal, so no cleanup of its own is needed. The source plan names a map; the set of written ids is an addition, explained below.
- An entry holds the receipt's role and name, the handles drawn for it, and a settlement: not yet settled, settled with a link (the record's id and name), or settled with nothing. The settlement is stored on the entry and not inferred from the map, because the row marker arrives in a write callback after the writer returns and the reply can settle in between.
- `echoCommand(line, receipt?)`: write the echo through `writeShellEcho`, passing a marker callback only when a receipt is present and its id is not already in the written set. When the echo was written, create the entry and put it in the map synchronously. When the row marker arrives, read the entry's settlement at that moment: unsettled draws a running marker, settled with a link draws the link directly, settled with nothing draws nothing. Without a receipt (`ask reset`, `tell reset`, a command that returned none) or when the echo was skipped, no entry exists and no marker is drawn.
- `displayReply(line, markdown, reply?)`: without `reply` (an application command's ordinary output from `useShellSubmit`) it writes exactly as today with no callbacks. With a `reply` whose `id` has no entry (a reply that arrived before its echo, or one replayed after a re-attach) it also writes exactly as today and records the id in the written set. A late receipt for that id then draws nothing. This is a small hardening of the source plan's "a reply that reaches the tab before its echo gets no marker or link": without it, a late echo that placement did not skip (some other write intervened) would draw a marker nothing could settle. With an entry: delete it from the map, add its id to the written set, then settle by what the reply carries.
  - With `reply.record`: the entry's settlement becomes the link. Every existing handle switches to the link (`show`). When the reply wrote its own command line, pass the head-marker callback so a linked marker is drawn on that row too. So when the reply continues beneath the original echo the original's marker turns into the link in place, and when the reply repeats its line both the original and the second echo carry the same link.
  - Without `reply.record` (a refusal, or a record deleted mid-prompt): the settlement is nothing. Every existing handle is removed, and no head-marker callback is passed.
  - The reply is written with the same placement outcome as today in every case.
- Click payloads. A running marker's click calls `openConnection` with `{ text: <receipt name>, kind: 'acp', acpRef: { scope: 'tab', label: <the tab's own label>, role } }`. A link's click calls it with `{ text: <record name>, kind: 'acp', recordId: <record id> }`. Neither needs a new capability or message: `capabilities.openConnection` already sends `openConnectionRecord`, and `src/controller/connection-records.ts` resolves a tab reference to the role's live record at click time (which is why a click after a model fallback opens the new model's record) and does nothing when there is no record yet or the record is gone. Existing tests in `src/controller/connection-records.test.ts` pin those no-ops (`no-ops for a missing or expired record id`, `no-ops when the tab or its live record binding has disappeared`).
- The tab's own label. `plugin-client-capabilities.ts` drops a tab reference whose label is not the tab's own, so the running marker needs `capabilities.label`. The source plan's wiring passes only an `openConnection` option, which leaves the hook no route to the label. `useShellTerminal` therefore also takes an optional `label` option, mirrored in a ref like the others, and the running click does nothing when it is absent. `07-client-wiring` passes it.
- Types. `useShellTerminal.ts` gains `openConnection?: (row: ShellConnectionRow) => void`, using the shell contract's own row type (a `ShellConnectionRow` is assignable to the capability's row, as `ShellTabMeta.tsx` already relies on). Non-test files under `web/src/plugins/<id>/` may not import `@shared/protocol` (the client block of `eslint.plugin-boundaries.mjs`), so the reply type is derived from the capability: take the parameter of `TabPluginClientCapabilities['onBackgroundReply']`'s callback and pick `id` and `record`. This is a derivation and not a local re-declaration of the wire shape, so principle 7 holds. The alias is exported from `useShellReplyWriters.ts` for `07-client-wiring`. The shell contract's `ShellAcpReceipt` is imported as a type.
- The handle type returned by `useShellTerminal`: `displayReply(line, markdown, reply?)` and `echoCommand(line, receipt?)`. Their parameters are optional, so the existing callers (`useShellSubmit`, `useBackgroundReplies`) still type-check unchanged.
- `useShellTerminal.ts` line budget. `05-reply-writers-plumbing` leaves it near 185 counted lines. The two options and their refs and the holder reset add about eight. If it passes 195, extract a further cohesive block (for example the key and selection setup in the attach effect) into a sibling module in the same directory; do not compact.
- The hook is the only place marker decisions live. `thinking-marker-decoration.ts` only draws, and the components hold no marker logic (`ai/guidelines/react-code-organization.md` §5, §6). The shell plugin imports nothing from another feature.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| The moved writers and their new row-marker callbacks | `useShellReplyWriters.ts`, `write-shell-reply.ts` (from `05-reply-writers-plumbing`) | Extended. |
| The drawing module | `addThinkingMarker` in `thinking-marker-decoration.ts` (from `04-marker-decoration`) | Called for every marker; mocked in the hook's test. |
| Per-attach reset point | `placementRef.current = placement` in `useShellTerminal.ts` | The holder resets beside it. |
| Option mirroring | `openLinkRef` and the other option refs in `useShellTerminal.ts` | The pattern for the `openConnection` and `label` refs. |
| Row opening | `capabilities.openConnection` in `plugin-client-capabilities.ts`; `openConnectionRecord` in `src/controller/connection-records.ts` | Both click payloads, unchanged. |
| Shell contract types | `ShellConnectionRow`, `ShellAcpRef` in `src/plugins/shell/shared.ts`; `ShellAcpReceipt` (from `02-dispatch-receipt`) | Typing the options and the receipt. |
| Hook test fixtures | `harness` in `web/src/plugins/shell/useShellTerminal.test.ts`; the fake terminal in `markdown-block.test.ts` | Patterns for the new test. |

## Proposed changes

- `web/src/plugins/shell/useShellReplyWriters.ts`: the holder type and factory, the entry type, the exported reply alias, the new `echoCommand` and `displayReply` behavior, and the two click handlers. Its inputs become one object (`terminalRef`, `placementRef`, the holder ref, `openLinkRef`, `openConnectionRef`, `labelRef`) in place of the three positional refs from `05`. Keep it under 200 counted lines; if the settle logic grows it, move the entry handling into a sibling pure module.
- `web/src/plugins/shell/useShellTerminal.ts`: the `openConnection` and `label` options and refs; a holder ref reset on every attach; pass them to the writers hook; widen the two writer signatures on `ShellTerminalHandle` (and the comments on them).

## Tests

Client (vitest project `client`), colocated:

- `web/src/plugins/shell/useShellReplyWriters.test.ts` (new), rendering the hook with a fake terminal whose `write(data, callback)` runs the callback and whose `registerMarker` returns a marker object, and with `./thinking-marker-decoration` mocked so each `addThinkingMarker` call and each handle's `show` and `remove` calls are recorded:
  - an echo with a receipt gets a running marker on the echo row's marker with the receipt's name; an echo with no receipt gets none; an echo that placement skipped gets none;
  - a reply with a record beneath its echo switches that echo's handle to the link with the record's name and draws no new marker, and clicking the link calls `openConnection` with `{ text, kind: 'acp', recordId }`;
  - a reply that repeats its line (something written in between, through the placement) switches the original echo's handle to the link and draws a linked marker on the repeated line's row;
  - a reply without a record removes the handle and draws nothing, and writes as a plain reply;
  - two echoes of the same line with different ids settle independently: a refusal removes only its own handle, and the other later links;
  - an `ask` and a `tell` outstanding at once keep their own roles in their running click payloads;
  - a reply for an unknown id, and a plain `displayReply(line, markdown)` with no reply, write exactly as today with no handle operations;
  - a reply that settles before the row marker arrives: the marker is then drawn directly as the link when there is a record, and not drawn when there is none (use a terminal whose write callback is held and released by the test);
  - a receipt that arrives after its reply was written draws no marker;
  - the running click calls `openConnection` with the tab reference built from the `label` option and the entry's role; with no `label` or no `openConnection` it does nothing and does not throw.
- `web/src/plugins/shell/useShellTerminal.test.ts`: after the terminal re-attaches (a new `ptyId`), a reply for an id that had an entry before behaves as an unknown id (it writes as one plain reply). Existing cases pass unchanged.
- `web/src/plugins/shell/write-shell-reply.test.ts`, `ShellTab.test.tsx`, and `useBackgroundReplies.test.ts` pass unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npx vitest run --project client web/src/plugins/shell/useShellReplyWriters.test.ts web/src/plugins/shell/useShellTerminal.test.ts web/src/plugins/shell/useShellTerminal.press-focus.test.ts web/src/plugins/shell/write-shell-reply.test.ts web/src/plugins/shell/ShellTab.test.tsx web/src/plugins/shell/useBackgroundReplies.test.ts`. Confirm `useShellTerminal.ts` and `useShellReplyWriters.ts` are under 200 counted lines, and search the shell directory's non-test files for any import of another plugin directory or of `@shared/protocol`.

There is no manual check at this stage. Nothing passes a receipt or a reply to the writers, so no marker appears in the running app; the first visible check is in `07-client-wiring`.

## Out of scope

- Passing the receipt from `useShellSubmit` and the reply from `useBackgroundReplies`, passing `openConnection` and `label` from `useShellTabTerminal`, and the `ShellTab` integration tests (`07-client-wiring`).
- Drawing, positioning, and the stylesheet (`04-marker-decoration`).
- Restoring markers after a reload, dock, or undock, and scrolling the connection tab to a prompt's block.
- A marker on `ask reset`, `tell reset`, or `monitor ask` lines.
