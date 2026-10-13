# Shell tab text transcript 02: rename the transcript RPC to `openTranscriptFileFor`

**Complexity: 3/10** — a behavior-preserving rename of one protocol method across 17 server and web files (protocol union, contract table, params validator, two dispatch switches, controller façade and function, web intent type and sender, plus their tests); mechanical, but every site must move in one change for typecheck and the exhaustive-dispatch checks to stay green.

## Goal

Rename the label-keyed RPC `openHarnessTranscriptFor` to `openTranscriptFileFor` everywhere it appears, with behavior unchanged, so subplan 06 can widen it to shell tabs without a new protocol method.

Source plan: `product/plans/ready/shell-tab-text-transcript.md`, implementation-order step 2.

## Design decisions carried from the source plan

- **Decision 16** (the rename half) — the button reaches the server through the existing transcript RPC, renamed `openTranscriptFileFor`; no new protocol method; the rename runs through every place the method name appears. The widening to a shell tab's `tab.transcript` is subplan 06.

## Decisions made in this subplan

- **No compatibility alias.** The old method name is removed outright, not kept as a second accepted method. The web client and the server ship in one package and are built together, so there is no older client to serve; a browser tab still holding a pre-rename bundle will have the old name rejected by `isClientMessage` (`src/client-message.ts`) like any unknown method until it reloads, which is acceptable for a button that silently no-ops anyway.
- **One atomic change.** The protocol union in `src/protocol/core-rpc.ts` types both the server dispatchers and the web `client.send`, so a partial rename does not typecheck. Land every file below in one commit; there is no intermediate green checkpoint.
- **Keep the web intent's `transcriptMethod` parameter.** `harnessTabIntents(client, label, transcriptMethod, recording?, workspaced?)` in `web/src/harness/harness-tab-intents.ts` takes the method from its caller by design (see the comment above `TranscriptMethod`); change only the literal in `export type TranscriptMethod = 'openHarnessTranscriptFor'` and the argument `HarnessTab.tsx` passes. Do not collapse the parameter or hard-code the method inside the intents builder.
- **Contract-table order.** `CLIENT_METHOD_CONTRACTS` in `src/client-message.ts` is alphabetical, so the renamed `openTranscriptFileFor: 'ack'` entry moves to sit after `openRecordingFor: 'ack'`. Every other list (the validator table in `src/client-params/core.ts`, the `case` lists in `src/message/handler.ts` and `src/message/tabs.ts`, the `TabMessage` union, the test tables) is not alphabetical: rename those in place.

## Dependencies

None. Independent of subplans 01 and 03. Subplans 06 and 07 depend on this one (they name `openTranscriptFileFor`).

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| RPC declaration `{ method: 'openHarnessTranscriptFor'; params: { label: string } }` and the comment above it | `src/protocol/core-rpc.ts:58` | Method renamed; comment kept as-is in substance (it already describes a harness tab's transcript, which stays true until subplan 06) |
| Reply-mode contract `openHarnessTranscriptFor: 'ack'` in `CLIENT_METHOD_CONTRACTS` | `src/client-message.ts:51` | Renamed and re-sorted (see decisions) |
| Params validator `openHarnessTranscriptFor: (p) => isString(p.label)` | `src/client-params/core.ts:53` | Key renamed in place |
| Dispatcher `case 'openHarnessTranscriptFor':` that forwards to `dispatchTabMessage` | `src/message/handler.ts:44` | Renamed |
| `TabMessage` union member and `case 'openHarnessTranscriptFor': { controller.openHarnessTranscriptFor(message.params.label); …` | `src/message/tabs.ts:10` and `:67` | Both renamed |
| Controller import `import { openHarnessTranscriptFor, openAcpTranscript } from './controller/transcript.js'` and façade method `openHarnessTranscriptFor(label: string): void { openHarnessTranscriptFor(this.managers, label); }` | `src/controller.ts:11` and `:75` | Both renamed (import keeps its `.js` extension) |
| Controller function `export function openHarnessTranscriptFor(managers: Managers, label: string)` | `src/controller/transcript.ts:10` | Renamed to `openTranscriptFileFor`; body unchanged in this subplan |
| Sibling comment "Silently no-ops like its sibling `openHarnessTranscriptFor`" | `src/controller/recording.ts:14` | Name in the comment updated |
| `TranscriptMethod` literal type and the `harnessTabIntents(…, 'openHarnessTranscriptFor', …)` call | `web/src/harness/harness-tab-intents.ts:7`, `web/src/harness/HarnessTab.tsx:64` | Literal renamed in both |

Verified list of files naming the method today (`git grep -ln openHarnessTranscriptFor -- . ':!product/plans'`, which covers `src/`, `web/src/`, `scripts/`, `documentation/`, `product/specs/`, `chrome-extension/`, `skills/`, `profiles/`, `bin/` and `.claude/`): `src/client-message.ts`, `src/client-params/core.ts`, `src/client-params/core.test.ts`, `src/controller.ts`, `src/controller.test.ts`, `src/controller/recording.ts`, `src/controller/recording.test.ts`, `src/controller/transcript.ts`, `src/controller/transcript.test.ts`, `src/message/handler.ts`, `src/message/handler.test.ts`, `src/message/tabs.ts`, `src/protocol/core-rpc.ts`, `web/src/harness/harness-tab-intents.ts`, `web/src/harness/harness-tab-intents.test.ts`, `web/src/harness/HarnessTab.tsx`, `web/src/harness/HarnessTab.test.tsx`. No spec, user or contributor documentation, script, or the remote protocol names the method. Plans under `product/plans/complete/` are historical records and are not edited; the source plan and subplans 03–08 already use the new name where they need it.

## Proposed changes

- Rename `openHarnessTranscriptFor` → `openTranscriptFileFor` at every site in the table above. A whole-word, case-sensitive replace over the 17 listed files is correct: no other identifier contains the string.
- Do not touch `openTranscriptFor` in the comment above `openAcpTranscript` (`src/controller/transcript.ts:18`, "Unlike `openTranscriptFor`, an empty exchange…"). It is a different, older name, not this method; leave it for whoever owns that comment.
- Update the comment above the function in `src/controller/transcript.ts` only enough that it reads correctly under the new name: it still describes today's harness-only resolution (the harness tailer's file, mirroring `harness transcript`, silent no-op). Subplan 06 rewrites it to describe both sources.
- Behavior is identical: the controller still opens `managers.harness.transcriptTailer(label)?.transcriptFile()` via `managers.openFile.edit(\`transcript ${label}\`, file, label)` and silently no-ops when there is no file.
- No file's counted line total changes by more than the re-sorted contract entry, so no `max-lines` extraction is needed.

## Tests

- Rename the method in the tests that name it, including test titles and `describe` names, not just call sites and expected messages:
  - `src/message/handler.test.ts` — the controller mock key (`openHarnessTranscriptFor: vi.fn()`, around line 73) and the "routes openHarnessTranscriptFor through the controller façade" case (around line 503).
  - `src/controller.test.ts` — the "openHarnessTranscriptFor is a silent no-op for a harness with no session record" case (around line 1643).
  - `src/client-params/core.test.ts` — the `['openHarnessTranscriptFor', { label: 'one' }, [{ label: 0 }]]` row.
  - `src/controller/recording.test.ts` — the comment at line 52.
  - `src/controller/transcript.test.ts` — the import and the `describe('openHarnessTranscriptFor', …)` block.
  - `web/src/harness/harness-tab-intents.test.ts` — the four `harnessTabIntents(…, 'openHarnessTranscriptFor')` calls and the two expected `send` payloads.
  - `web/src/harness/HarnessTab.test.tsx` — the "dispatches openHarnessTranscriptFor…" case and its expected `method`.
- Assertions are otherwise unchanged; no new test is needed for a pure rename, since the existing routing, validator, controller and client-send tests each pin the new name at their layer.
- `src/message/handler-exhaustive.test.ts` and `src/client-message.test.ts` must stay green unchanged (they guard that every contract has a dispatcher `case` and that the result/deferred method sets are complete; `openTranscriptFileFor` is `ack`, so neither list changes).

## Verification

- `./scripts/run.mjs check-diff` — both server and web tests run, since `src/` and `web/src/` both change.
- `git grep -n openHarnessTranscriptFor -- . ':!product/plans'` returns nothing.
- Manual (optional, quick): open a harness tab, press its **Open transcript** button, and confirm the editor tab `transcript <label>` still opens.

## Out of scope

- Resolving a shell tab's `tab.transcript` in the controller, and rewriting the `transcript.ts` comment to describe it — subplan 06.
- Any client capability or shell button — subplan 07.
- Editing completed plans, or the stale `openTranscriptFor` reference in the `openAcpTranscript` comment.
