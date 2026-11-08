# Wiring the thinking marker into the shell tab
**Complexity: 4/10** — earlier subplans built the server metadata and client marker lifecycle, but this subplan joins the dispatch receipt, settled reply, and connection opener across two hook paths; its integration tests must exercise both dispatch routes and extend the xterm stub to render decorations.

## Goal

Make the thinking indicator live. Read the dispatch receipt where the shell echoes an ACP line, pass the settled reply through to the writers, and hand the writers the means to open a connection tab. After this subplan an `ask` or `tell` echo shows `Thinking` with a spinner, and the marker becomes the `see thought process` link when the prompt settles. The behavior specs are updated here, because this is the subplan that makes the behavior real.

## Design decisions and dependencies

This subplan consumes:

- From `02-dispatch-receipt`: the runtime guard `isShellAcpReceipt` and the type `ShellAcpReceipt` from `@shared/plugins/shell/shared`, and the receipt arriving as `result.result` on a core-response dispatch reply from both the `dispatch` and the queued `dispatch-command` intents.
- From `03-reply-record-and-tell-line`: replies from `onBackgroundReply` carry `line` for `ask` and `tell` (resets included) and an optional `record: { id, name }`.
- From `06-marker-lifecycle`: `echoCommand(line, receipt?)` and `displayReply(line, markdown, reply?)` on the handle `useShellTerminal` returns; the exported reply alias from `useShellReplyWriters.ts`; and the `openConnection` and `label` options on `useShellTerminal`.

Source plan requirements carried here: "Shell client changes" bullets on `useShellTabTerminal.ts`, `useShellSubmit.ts`, and `useBackgroundReplies.ts` (and that `ShellTab.tsx` needs no edit); "Scope" (local and remote shells alike, both roles; `ask reset` and `tell reset` get no marker); "Edge cases" (an `ask` and a `tell` at once; the same line twice; `ask reset` and `tell reset` echo without a marker); "UI design" Interaction (a click opens or focuses the connection tab and the command bar keeps its draft); the `useBackgroundReplies.test.ts` and `ShellTab.test.tsx` entries in "Tests"; "Documentation" for the two behavior specs.

- Land all three hook and terminal-wiring edits together: the dispatch receipt starts the marker, the settled reply completes it, and the terminal options make its clicks actionable.
- `useShellSubmit.ts`: on a `coreResponse` dispatch, read `result.result` only when `isShellAcpReceipt(result.result)` succeeds, then pass the narrowed receipt to `echoCommand(text, acpReceipt)`. `result.result` is `unknown` in `ShellDispatchResult` (`src/plugins/shell/shared.ts`), so a missing or malformed receipt must leave the echo unmarked. That covers `ask reset`, `tell reset`, and any core-response command that does not return this receipt. Both the `dispatch` and `dispatch-command` intents return the same reply shape and pass through these lines of this function, so the queued path needs no separate code. The function's callback already has a parameter named `receipt` (the command queue's receipt string), so the ACP receipt needs a distinct name. The hook's `echoCommand` input type gains the optional second argument.
- `useBackgroundReplies.ts`: pass the whole reply through as `displayReply(reply.line ?? 'monitor', reply.output, reply)`. Its `displayReply` parameter type gains the optional third argument, typed with the alias exported from `useShellReplyWriters.ts`. Its dedup by `reply.id` is unchanged. `ShellTab.tsx` (198 counted lines) keeps its `useBackgroundReplies(capabilities.onBackgroundReply, displayReply)` call unchanged and needs no edit; confirm by reading the diff that it is untouched.
- `useShellTabTerminal.ts`: pass `openConnection: (row) => { capabilities.openConnection?.(row); }` beside `openLink`, and `label: capabilities.label`. The label is the addition to the source plan described in `06-marker-lifecycle`. It is needed because the host drops a tab reference whose label is not the tab's own.
- Neither click needs a new capability or message. The tab opens or focuses as the current centre tab with focus, at its newest history, exactly as opening a row from the shell's connections window does; the click bubbles to the tab body, which returns the keyboard to the command bar, so the draft is kept.
- Remote shells need no separate path. A remote shell's ACP records are kept locally (`product/specs/acp.md` § Remote connections), the commands run locally, and the receipt and record come from local managers.
- Specs (behavior, per principle 10). `product/specs/shell-tab.md` § Core ACP connections and `product/specs/acp.md` § Answers, activity, and questions describe the marker and its link and when each appears, in the source plan's terms: while the prompt runs the echo reads `> <command and params> Thinking <spinner>`; clicking it opens or focuses the connection tab of the role's live session at its newest history (so it follows a model fallback), and does nothing before the role's record exists; when the prompt settles the marker is replaced by a link reading `see thought process`, pinned to the record that answered (the last model's when every model failed), which keeps opening that record after a reset, a fallback, or the session closing, and does not scroll to the prompt's block; an answer, an `ACP error: …`, `ACP: prompt cancelled.`, and `ACP session closed.` each get the link, and a refusal (`ACP: a prompt is already running.`, `ACP: the <role> role lists no models.`, a usage line) removes the marker with nothing in its place; the placement rules are unchanged, every echo of the line carries the link, and a reply that arrives before its echo gets none; `ask reset` and `tell reset` get no marker. The shell-tab section also states the screen behavior: markers and links hide while a full-screen program holds the terminal and return after it, are re-placed after a resize reflows the line, are not terminal text (so terminal search does not see them and selection and copy do not include them), do not survive a reload, dock, or undock, and are operated by pointer only. The tooltip and accessible name are `Open acp:<role>:<tab name>`. The `tell` placement sentence from `03-reply-record-and-tell-line` is already in the shell-tab section. The popup-specific section in `product/specs/connections-tab.md` remains unchanged; these shell entry points use the capability and opener it already describes.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Echo at dispatch | `useShellSubmit` in `web/src/plugins/shell/useShellSubmit.ts` (`if (result.coreResponse) echoCommand(text)`) | Reads the receipt here. |
| Settled reply delivery | `useBackgroundReplies` in `useBackgroundReplies.ts` | Passes the reply through. |
| Terminal wiring | `useShellTabTerminal.ts` (passes `openLink` today) | Passes `openConnection` and `label`. |
| Writers and lifecycle | `useShellTerminal.ts`, `useShellReplyWriters.ts` (from `05` and `06`) | The handle gains nothing new here. |
| Receipt guard | `isShellAcpReceipt` in `src/plugins/shell/shared.ts` (from `02`) | Called in `useShellSubmit`. |
| Capability | `capabilities.openConnection` in `web/src/plugins/plugin-client-capabilities.ts` | Called by both clicks, unchanged. |
| ShellTab test harness | `makeCapabilities`, `renderTab`, the `@xterm/xterm` stub, and the existing ACP echo and reply cases in `web/src/plugins/shell/ShellTab.test.tsx` (around the `acp summarize this` cases) | Extended as below. |
| Hook test | `web/src/plugins/shell/useBackgroundReplies.test.ts` | Its three assertions change. |

## Proposed changes

- `web/src/plugins/shell/useShellSubmit.ts`: read and pass the receipt; widen the `echoCommand` input type.
- `web/src/plugins/shell/useBackgroundReplies.ts`: the third argument and its type.
- `web/src/plugins/shell/useShellTabTerminal.ts`: the two options.
- `product/specs/shell-tab.md`, `product/specs/acp.md`: the behavior text above.

## Tests

Client (vitest project `client`), colocated:

- `web/src/plugins/shell/useBackgroundReplies.test.ts`: the existing assertions currently check `display` was called with `('monitor', reply.output)` and `('acp summarize this', '## Answer')` and so on. They change to expect the whole reply as the third argument. A new case checks that a reply carrying `id` and `record` reaches `displayReply` intact. Deduplication by `id` stays.
- `web/src/plugins/shell/ShellTab.test.tsx`, with its xterm stub extended: `write` runs its completion callback; `registerMarker` returns a marker object with a line and a `dispose`; `registerDecoration` returns a decoration that records its `onRender` handler, appends its element to the document, and renders it once, so the marker can be found by role and name. `makeCapabilities` gains an option for the dispatch reply's `result` (the receipt), an `openConnection` mock, and the tab label (already `shell1` by default). The stub currently has no `terminal.element`, so the drawing module must also tolerate a missing screen; the stub does not need layout. New cases:
  - an `ask` line through settlement: after the dispatch answer, the echo carries a link-role element named `Open acp:ask:shell1` that reads `Thinking`; after a reply with a record, the same element reads `see thought process` with no brackets;
  - clicking the running marker calls `openConnection` with `{ text: 'acp:ask:shell1', kind: 'acp', acpRef: { scope: 'tab', label: 'shell1', role: 'ask' } }`; clicking the link calls it with `{ text, kind: 'acp', recordId }`; a draft typed in the bar before the click is still there after it;
  - a refused second prompt for the same line (two receipts, the second reply without a record) removes only the second marker; the first keeps `Thinking` and later becomes the link;
  - an `ask` and a `tell` outstanding at once each settle their own marker;
  - a `tell` reply that arrives after other output writes a second echo and both echo rows carry the link;
  - `ask reset` and `tell reset` (dispatch replies with no `result`) echo with no marker, and their replies still land beneath their own echoes;
  - a reply that arrives before its dispatch answer leaves no marker;
  - a core-response dispatch result that is missing a receipt or fails `isShellAcpReceipt` leaves the echo unmarked;
  - the queued path: a line that goes through `dispatch-command` gets the same marker.
- Existing ACP cases in this file (`acp summarize this` and `acp reset`) keep passing, because they dispatch with no `result`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npx vitest run --project client web/src/plugins/shell/ShellTab.test.tsx web/src/plugins/shell/useBackgroundReplies.test.ts web/src/plugins/shell/useShellReplyWriters.test.ts web/src/plugins/shell/useShellTerminal.test.ts`. Confirm `ShellTab.tsx` has no diff and `useShellSubmit.ts` is under 200 counted lines.

A smoke check is now possible, by a person or a browser-capable tool (an agent inside a workspace sandbox cannot start a browser): in a shell tab run `ask what is 2+2`. The echo shows a muted `Thinking` and a spinner; when the answer arrives the marker reads `see thought process`; clicking each opens the ask connection tab. The full set of manual steps, including the `vim` and `tell` cases, is in `08-docs-and-verification`.

## Out of scope

- Help pages and user documentation (`08-docs-and-verification`).
- Any new key binding, command, or capability.
- Streaming the thinking into the shell, scrolling the connection tab to the clicked prompt, and elapsed time, model name, or activity in the marker.
- Tabs other than the shell tab.
