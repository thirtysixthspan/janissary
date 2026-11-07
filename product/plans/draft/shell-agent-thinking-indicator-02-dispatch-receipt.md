# Dispatch receipt for shell ask and tell
**Complexity: 3/10** — folds two copy-pasted command bodies into one helper and changes what `ask` and `tell` return from dispatch, so the agent tool loop that prints any defined result and one existing plugin-session assertion must change in the same step even though the shell ignores the receipt until the client lands.

## Goal

Make `ask <prompt>` and `tell <prompt>` answer a dispatch with a receipt `{ replyId, role, name }` as the command's `result`, and make the settled background reply carry that `replyId` as its `background` id, so the shell can later match an echo to its reply by id. Keep granted agents from ever seeing the receipt. Give the shell plugin's import-free contract the receipt type and guard the client will read.

## Design decisions and dependencies

This subplan consumes no export from `01-acp-result-record-id`. It lands after it only because both edit `src/acp/response.ts`. `03-reply-record-and-tell-line` consumes the `appendAcpBackgroundReply` signature set here. `06-marker-lifecycle` and `07-client-wiring` consume the receipt type and guard.

Source plan requirements carried here: "Server changes" bullets on the shared `ask`/`tell` helper and its receipt, on `appendAcpBackgroundReply` taking the id minted at dispatch, on `src/agent/command-tools.ts`, and on `ShellAcpReceipt` and `isShellAcpReceipt`; "Scope" (applies to `ask` and `tell`, local and remote alike; `ask reset` and `tell reset` get no receipt); "Edge cases" (the same line typed twice is matched by id, never by text, which needs a distinct id per dispatch including a refused one); the server half of the "Tests" list for `ask.test.ts`, `tell.test.ts`, and `command-tools.test.ts`.

- `src/commands/ask.ts` and `src/commands/tell.ts` are identical apart from the role. Their shared body moves into one exported helper in `src/acp/response.ts` (43 counted lines before `01`, about 45 after it). Suggested name `runAcpCommand`; it takes the command text, the `{ label, index }` tab, the managers, the invocation context, and the role. Both commands shrink to a `run` that calls it with their role and returns its value; their now-unused imports go.
- The helper mints the background reply's id with `randomUUID` at dispatch, not at settlement. It starts the prompt exactly as the commands do today (`managers.acp.promptResult(label, command, role, { appendRefusalToTranscript: false })`, settle once, a rejection settles as `ACP error: <text>`). `ask` used to pass `undefined` for the role and rely on the default; the helper passes the role explicitly, and `DEFAULT_ACP_ROLE` is `'ask'`, so behavior is the same. It returns the receipt synchronously, before the prompt settles. A refusal is learned only when the prompt settles, so a refused dispatch still gets a receipt and its later reply carries the same id. That is what lets two identical lines be told apart.
- `name` is `acp:<role>:<tab name>` where the tab name is `managers.tab.byLabel(label)?.title ?? label`. `run` receives only `{ label, index }`, so the title is read from the tab manager. Build the string with `recordConnectionName` from `src/plugins/connections/shared.ts` (an import-free contract with no cycle risk, passing `kind: 'acp'`, the role, and the tab name as `ownerName`). That function is the one definition of the connection tab's title, and the answering record's name in `03-reply-record-and-tell-line` uses it too, so the running marker and the link cannot drift.
- Correction to the source plan's reference: the "same `tab.title ?? tab.label` a new record captures as `ownerName`" is captured in `src/acp/session-manager.ts` (`session()`, the `source` object, `ownerName: tab.title ?? label`). `src/plugins/connections-topic-rows.ts:71` computes the same value for the live rows only.
- Receipt type: export a type from `src/acp/response.ts` (suggested `AcpDispatchReceipt`: `replyId: string`, `role: AcpRole`, `name: string`) so the helper, its tests, and the shell plugin's pin test share one server-side definition.
- `appendAcpBackgroundReply(managers, label, input, result, id)` takes the id as a new last parameter and stores it as the entry's `background`; it no longer calls `randomUUID` itself. The `randomUUID` import stays in the file for the helper. The only callers are the two commands, now the helper.
- The `coreResponse` branch of `CommandManager.dispatchLine` in `src/command/manager.ts` already returns `...(result !== undefined && { result })`, and `dispatchLine` serves all three entry points: `dispatchLineWithOutput` (the shell's `dispatch` intent, through `src/plugins/line-capabilities.ts`), `dispatchQueuedLine` (the shell's `dispatch-command` intent, through `dispatchQueuedCommand` in `src/plugins/queue-capabilities.ts`, called from `src/plugins/shell/activate.ts`), and `dispatchLineInInvocation` (the agent tool loop). `src/command/manager.ts` needs no edit. The shell plugin's intent returns the whole reply as JSON-compatible data, so the receipt crosses the wire with no new message.
- `src/agent/command-tools.ts`: `runGrantedAgentCommand` turns any defined `result` into the tool output, so an agent granted `ask` or `tell` would start seeing the receipt where it sees empty output today. It returns `result.output` whenever `result.coreResponse` is true. This is the only caller that reads `result`. The launcher (`web/src/plugins/launcher/launcher-actions.ts`: `if (reply.coreResponse || !reply.output) return null`) and the diff and launcher server plugins' own `dispatchLineWithOutput` calls already ignore it. It must land with the receipt, in this subplan, so no state exists where a granted agent sees the receipt.
- `src/plugins/shell/shared.ts` (148 counted lines): add a `ShellAcpReceipt` type (`replyId: string`, `role: 'ask' | 'tell'`, `name: string`) and an `isShellAcpReceipt` guard, re-declared there like the module's other shapes and using its own `isRecord`. The guard rejects arrays, `null`, a missing or non-string field, and any role other than `ask` or `tell`. The client reads it in `07-client-wiring`; nothing calls it until then (ESLint does not flag an unused export; `knip`, which only `npm run check:full` runs, would).
- Two existing assertions and one mock must change because of the receipt: `src/acp/plugin-session.test.ts` line 218 (`dispatchLineWithOutput('consumer', 'ask hello', 1)` resolves `toEqual({ dispatched: true, output: '', coreResponse: true })`) now also has `result`; and the managers mock built by `run` in `src/commands/ask.test.ts` and `src/commands/tell.test.ts` is `{ acp: { promptResult }, tab: { append } }` with no `byLabel`, which the helper calls. Neither is named in the source plan. The `ask reset` and `tell reset` assertions in `plugin-session.test.ts` (lines 336 and 360) stay as they are because those commands return nothing.
- Specs and docs ride here because the dispatch reply's shape is a contract plugins can see: `product/specs/acp.md` § Commands (the paragraph that says the dispatcher "marks their replies as core-rendered, so dispatch itself adds no immediate terminal line") gains the receipt, `product/specs/application-commands.md` § Structured command replies gains a sentence that a core-response command may carry a result and that `ask` and `tell` do, and `documentation/developer-documentation/tab-plugins.md` (the paragraph on core responses near "Application commands marked as core responses return `coreResponse: true`") gains the same clause. These three edits are not named by the source plan. They are added for accuracy under principle 10.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| The two command bodies | `src/commands/ask.ts`, `src/commands/tell.ts` | Replaced by calls to the helper. |
| Settled reply delivery | `appendAcpBackgroundReply` in `src/acp/response.ts` | Takes the id as a parameter. |
| Dispatch result plumbing | `coreResponse` branch of `dispatchLine` in `src/command/manager.ts`; `src/plugins/line-capabilities.ts`; `src/plugins/queue-capabilities.ts`; the shell's `dispatch` and `dispatch-command` intents in `src/plugins/shell/activate.ts` | Carries the receipt to the client with no change. |
| Connection tab title | `recordConnectionName` in `src/plugins/connections/shared.ts` | The one definition of `acp:<role>:<name>`. |
| Tab title or label | `Tab.title` on `managers.tab.byLabel(label)` | The tab name in the receipt. |
| Agent tool loop | `runGrantedAgentCommand` in `src/agent/command-tools.ts` (65 counted lines) | Gains the `coreResponse` rule. |
| Shell plugin contract | `src/plugins/shell/shared.ts` and its pin tests in `src/plugins/shell/shared.test.ts` | Gains the receipt type and guard, pinned against the server type. |
| End-to-end harness | `setup` in `src/acp/plugin-session.test.ts` (real records, tab, and command managers) | One case asserts the receipt id equals the reply's `background`. |

## Proposed changes

- `src/acp/response.ts`: add the exported receipt type and the exported helper; give `appendAcpBackgroundReply` the trailing id parameter. The file stays far under 200 counted lines.
- `src/commands/ask.ts`, `src/commands/tell.ts`: delegate to the helper with their role and return the receipt; drop the unused imports. Names, `match`, `samples`, `available`, and `coreResponse: true` stay as they are.
- `src/agent/command-tools.ts`: return `result.output` when `result.coreResponse` is true, before the existing `result.result` handling.
- `src/plugins/shell/shared.ts`: add `ShellAcpReceipt` and `isShellAcpReceipt` near `ShellDispatchResult`, whose comment mentions that a core-response reply may carry the receipt as `result`.
- `product/specs/acp.md`, `product/specs/application-commands.md`, `documentation/developer-documentation/tab-plugins.md`: one to two sentences each, as above. The receipt sentence says it holds the id the settled reply will carry, the role, and the name `acp:<role>:<tab name>`, that a refused prompt gets one too, and that `ask reset` and `tell reset` return none.

## Tests

Server (vitest project `server`), colocated:

- `src/commands/ask.test.ts` and `src/commands/tell.test.ts`: the shared `run` builder gains `tab.byLabel` and returns the command's value. `run` returns `{ replyId, role, name }` with the right role. `name` uses the tab's title and falls back to the label when it has none. The settled background entry's `background` equals `replyId`; the existing cases currently assert `expect.any(String)` and now assert the receipt's id. A refused prompt (usage, already running) settles under the same receipt id. The prompt is started with the right role (`'ask'` explicitly, `'tell'`). The existing rejected-prompt and competing-settlement cases still pass.
- `src/acp/response.test.ts` (created in `01-acp-result-record-id`): `appendAcpBackgroundReply` stores the given id as `background` and no longer invents one.
- `src/agent/command-tools.test.ts`: a granted command whose dispatch reply has `coreResponse: true` and a `result` returns its `output` and not the JSON of `result`; a non-core reply with a string or object `result` still returns that result as before. The test's `snapshot` grants `question`; the new case grants `ask`.
- `src/plugins/shell/shared.test.ts`: `isShellAcpReceipt` accepts a well-formed receipt for each role and rejects `null`, an array, a missing or non-string `replyId` or `name`, and a role such as `'monitor'`. A pin test asserts `ShellAcpReceipt` and the server's receipt type are assignable to each other, the way the file already pins `ConnectionView` and `AcpRef`.
- `src/acp/plugin-session.test.ts`: update line 218's expected object to include `result: { replyId: expect.any(String), role: 'ask', name: 'acp:ask:consumer' }`, and extend the same case so the entry that settles has `background` equal to that `replyId`. The tab in this harness has no title, so the name uses the label `consumer`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then run the named files by path: `npx vitest run --project server src/commands/ask.test.ts src/commands/tell.test.ts src/commands/ask-reset.test.ts src/commands/tell-reset.test.ts src/agent/command-tools.test.ts src/plugins/shell/shared.test.ts src/acp/plugin-session.test.ts src/acp/manager-fallback.test.ts src/acp/response.test.ts src/command/manager.test.ts`. Read the diff to confirm `src/command/manager.ts` is untouched and that `runGrantedAgentCommand` is the only reader of `result.result` (search `\.result\b` under `src/agent`, `src/plugins`, `src/schedule`, `src/command-queue`).

No manual check shows the receipt: the shell client ignores `result` for a core-response dispatch until `07-client-wiring`. A smoke run in a shell tab is still worth doing by a person or a browser-capable tool: `ask hi` echoes and answers exactly as before, and `ask reset` still reports beneath its own echo.

## Out of scope

- Reading the receipt in the shell client, the marker, and the link (`06-marker-lifecycle`, `07-client-wiring`).
- Storing the answering record on the reply and the `record` wire field (`03-reply-record-and-tell-line`).
- The `tell` line fix (`03-reply-record-and-tell-line`).
- Any receipt for `ask reset`, `tell reset`, or `monitor ask`, and any change to those commands.
- A new capability, a new message, or a plugin API version change.
