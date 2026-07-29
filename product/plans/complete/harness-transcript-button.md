# Add a transcript button to the harness tab metadata bar

**Complexity: 3/10** — one new client→server RPC following an exactly-precedented shape (`openTranscriptFor`/`openAcpTranscript`), a small new handler that reuses an existing tailer lookup, and wiring one existing prop already supported by `AgentTabMeta`; no new UI markup.

## Summary

Per the backlog: "add a clipboard button floated right on the harness tab metadata bar that shows the harness transcript in an editor tab." Agent tabs already show this clipboard-icon "Open transcript" button in their metadata row (`web/src/AgentTabMeta.tsx:66-76`, wired from `AgentTabBody.tsx`/`InactiveAgentTabBody.tsx` via the `openTranscriptFor` RPC) — per `product/specs/tabs.md:142`, today it explicitly reads "Agent tabs (not harness tabs) also show a clipboard-icon button." Harness tabs (`web/src/HarnessTab.tsx`) already render `AgentTabMeta` for their metadata row (with file-navigator, launch-agent, connections, and schedule buttons) but do not pass `onOpenTranscript`, so the button never appears there today, even though `AgentTabMeta` already supports it.

The existing `openTranscriptFor` RPC can't simply be reused for a harness tab: its handler (`src/controller/transcript.ts:8-13`) reads `tab.log`, the agent-tab command-bar transcript — harness tabs have no command bar and no `LogEntry` transcript (`product/specs/harness.md:212`). What a harness tab has instead is its **session transcript**, already served by the `harness transcript <label>` command via `HarnessManager.transcriptTailer(label)` (`src/harness/manager.ts:60-64`) and `HarnessTranscriptTailer.transcriptFile()`. This fix adds a small parallel RPC that opens that same file.

## Design decisions

- **A new RPC, not a branch inside `openTranscriptFor`.** `openTranscriptFor` is documented (`src/protocol.ts:277-279`) as specifically the agent-tab `tab.log` transcript; branching it on tab kind would blur that contract for its existing callers. A sibling RPC `openHarnessTranscriptFor` (mirroring how `openAcpTranscript` sits alongside `openTranscriptFor` in the same file) keeps each handler single-purpose.
- **Reuse the tailer, not the CLI subcommand.** `transcriptSubcommand` (`src/harness/subcommands.ts:42-54`) is shaped for the `harness transcript <name>` command — it returns an error *string* to print into the invoking tab's transcript. A harness tab's metadata-row button has no transcript to print an error into (same constraint the existing "New agent here" button already documents at `tabs.md:138-140`), so the new handler silently no-ops when there's no tailer or no file yet, matching `openTranscriptFor`'s own no-op-on-empty convention rather than `openAcpTranscript`'s "always open, placeholder on empty" convention.
- **Opens the file exactly as `harness transcript` does.** Same `managers.openFile.edit(...)` call, same file (`.janissary/harness-transcripts/<label>-<timestamp>.txt`) — a point-in-time open of the file as it stands, not a live view. No new file format or content.

## What already exists (reuse, don't rebuild)

| Need | Existing thing | Location |
| --- | --- | --- |
| The clipboard button, icon, and right-floated action group in the metadata row | `AgentTabMeta`'s `onOpenTranscript` prop/button | `web/src/AgentTabMeta.tsx:12,66-76` |
| Resolving a harness tab's transcript tailer/file | `HarnessManager.transcriptTailer(label)` → `.transcriptFile()` | `src/harness/manager.ts:60-64` |
| The RPC shape and message-handler wiring pattern for a metadata-row button | `openTranscriptFor` (protocol, handler, message-handler case) | `src/protocol.ts:277-280`, `src/controller/transcript.ts:8-13`, `src/message-handler.ts:118-119` |
| Opening a file as an editor tab from the active tab | `managers.openFile.edit(input, file, managers.tab.cur().label)` | `src/harness/subcommands.ts:52` |

## Implementation steps

1. **`src/protocol.ts`** — add, next to `openTranscriptFor` (after line 280): `| { method: 'openHarnessTranscriptFor'; params: { label: string } }` with a doc comment mirroring `openTranscriptFor`'s, noting it opens the harness *session transcript* tailer file and no-ops when unavailable.
2. **`src/controller/transcript.ts`** — add `openHarnessTranscriptFor(managers: Managers, label: string): void`: looks up `managers.harness.transcriptTailer(label)?.transcriptFile()`; returns (no-op) if there's no tailer or no file yet; otherwise calls `managers.openFile.edit(\`transcript ${label}\`, file, label)`.
3. **`src/message-handler.ts`** — import `openHarnessTranscriptFor` alongside the existing `openTranscriptFor`/`openAcpTranscript` import, and add `case 'openHarnessTranscriptFor': { openHarnessTranscriptFor(controller.managers, message.params.label); break; }` next to the `openTranscriptFor` case, with the same "bridges straight to controller/transcript.js" comment convention.
4. **`web/src/HarnessTab.tsx`** — pass `onOpenTranscript={() => client.send({ method: 'openHarnessTranscriptFor', params: { label } })}` into the existing `<AgentTabMeta ... />` call (no changes to `AgentTabMeta.tsx` itself — the prop and button already exist there).
5. **`product/specs/tabs.md:142`** — update "Agent tabs (not harness tabs) also show a clipboard-icon button" to state that harness tabs show it too, opening the harness's session transcript file rather than a command-bar log, and no-op the same way when no transcript is available yet.

## Tests

- `src/controller/transcript.test.ts` (existing — extend): `openHarnessTranscriptFor` opens the tailer's file via `managers.openFile.edit` when a tailer/file exists; no-ops (never calls `openFile.edit`) when `transcriptTailer` returns `undefined`; no-ops when the tailer exists but `transcriptFile()` returns `undefined`.
- `src/message-handler.test.ts` (existing — extend, mirroring the `openTranscriptFor` routing test): an `openHarnessTranscriptFor` message is routed to the handler with `controller.managers` and the passed `label`.
- `web/src/HarnessTab.test.tsx` (existing — extend): `AgentTabMeta` receives an `onOpenTranscript` callback; clicking it sends `{ method: 'openHarnessTranscriptFor', params: { label } }` for that harness tab's label.

## Out of scope

- Any change to `AgentTabMeta.tsx`'s markup, icon, or CSS — the button already exists and is reused as-is.
- Any change to `openTranscriptFor`, `openAcpTranscript`, or `transcriptSubcommand` (the CLI `harness transcript` command keeps working exactly as before).
- Showing the button on shell (PTY-takeover) tabs, which have no session transcript either.
