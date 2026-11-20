# Labelled fenced block 3 — wire both paths to the shared extractor

**Complexity: 5/10** — 12 added production lines, 3 production files, 7 requirements and 18 scenarios across 12 test files (p=5.28)

Make the core and agent-driven paths actually take their command from the labelled block. Point `toolExtractor` at the shared extractor, delete the old agent extractor module and its test, and have `driveToolLoop` call the shared extractor directly with `snapshot.askUser` as `allowQuestion` for the agent kind. Gating and which side runs a command stay exactly as they are.

Depends on `./product/plans/ready/labelled-fenced-block-1-command-block-extractor.md` (shared extractor) and `./product/plans/ready/labelled-fenced-block-2-loop-result-contract.md` (loop reads the result type). Source: `./product/plans/complete/labelled-fenced-block.md`.

## Goal

Replace the temporary adapter from subplan 2 with the real shared block extractor on both snapshot kinds, retire `src/agent/command-extract.ts`, and move its test coverage into `src/acp/command-block.test.ts`. After this subplan there is one block rule and one extractor implementation; the old wrapper and its second fenced-content scan are gone.

## Design decisions

- `toolExtractor` at `src/acp/tool-table.ts:195` changes its return type to the result type and delegates to the shared extractor instead of calling `findLastCommandLine`, passing `allowQuestion: true` so a question line is a normal command for the core path. Keep `AcpTool.isCommandLine`, `gateCommand`, and `nativeCommandName` as the definitions of a known command and its permission. Tool-table order and ownership do not change; extraction no longer depends on table order, matching the existing note in `tool-table.ts` that the last recognized line wins.
- `src/acp/drive-loop.ts:74` uses `toolExtractor(tools)` for the core kind (now result-typed) and calls the shared extractor for the agent kind with `snapshot.askUser` as `allowQuestion` so the preserved question behaviour holds. Remove the temporary adapter, the local wrapper, and the import of `extractAgentCommand`. The shared extractor's block span flows straight into the display filter from subplan 2.
- Delete `src/agent/command-extract.ts` now that its fence helpers live in `command-block.ts` (subplan 1) and nothing imports it. Delete `src/agent/command-extract.test.ts`; fold its cases into `src/acp/command-block.test.ts`: the `janissary ` marker is not required inside a labelled block but is still tolerated there, a bare final command line outside a labelled block is not extracted, and tilde-fenced content is not read unless it is the last closed labelled block.
- Because there is no bare-line fallback, every fixture that feeds a bare command line as the model's reply must become a final fenced block whose info string is exactly `janissary` (backtick or tilde fences); the shared extractor only sees a command inside the last closed labelled block. This widens the test scope to the twelve files named under Tests: bare lines that must drive a command are re-expressed as blocks, while near-miss and negative fixtures that assert `absent`/a final answer — unlabelled fences, prose, tool-less sessions, late callbacks, ungranted or malformed commands — stay as-is. Keep each test's gating, side selection, step counts, recorded/frame text, and other behavioral assertions unchanged, changing only the reply fixture (and, where the extractor's return type changed, the shape of the extraction assertion). Where a fixture used the old `janissary ` line prefix, for example `start([['janissary file read a.md'], ...])` at `src/remote/serve-acp-loop.test.ts:388`, drop the prefix inside the block and put the label in the info string: assertions expect the plain command, and the extractor strips the prefix only as a tolerance.
- Leave `cleanCommandLine` and `findLastCommandLine` in `src/acp/command-line.ts` unchanged. `extractDatabaseCommand` (`src/database/primer.ts:30`), `extractQuestionCommand` (`src/question-command.ts:44`), and `extractBrowserCommand` (`src/browser/command.ts:87`) still call `findLastCommandLine` for their own whole-reply extractors and stay out of this change.
- The remote path needs no new protocol message, RPC, or frame. `src/remote/serve-acp-loop.ts:109` calls `driveToolLoop` on the far side, so the extraction change lands wherever `driveToolLoop` runs. Verify no remote frame type changes.
- Keep file sizes under the 200-line `max-lines` rule; do not grow `src/acp/tool-table.ts`. New relative imports use `.js` extensions per `AGENTS.md`.

## What already exists (reuse, don't rebuild)

| Existing code | What it does | How this subplan reuses it |
| --- | --- | --- |
| `src/acp/command-block.ts` (subplan 1) | One shared block extractor and result type | Call it from `toolExtractor` and `driveToolLoop`; no second fence scan. |
| `src/acp/tool-table.ts:195` (`toolExtractor`) | Current line-based extractor factory | Replace its body with a delegation; keep the table, predicates, and gate untouched. |
| `src/acp/drive-loop.ts:63` (`driveToolLoop`) | Chooses extractor and primer per snapshot kind and drives the loop | Swap both extractor branches for the shared extractor; keep primer choice, `maxSteps`, `describeCommand`, and event forwarding as they are. |
| `src/agent/command-extract.ts:16` (`extractAgentCommand`) | Old agent-wrapper extractor with its own fenced-content scan | Retire the file after its fence helpers move; do not keep a wrapper. |

## Proposed changes

Describe each edit in prose: the new `toolExtractor` contract (a factory returning a function of reply text to the result type, using the shared extractor with the tool vocabulary gate), the `driveToolLoop` extractor argument for core and agent kinds, and the two file deletions. Name the folded test cases; do not write implementation code.

The test edits change only how a model reply is written, not what is asserted. In each of the twelve files listed under Tests, a reply that must produce a command becomes a trailing fenced block whose info string is exactly `janissary` and whose content is the command the test already expects; a reply that must stay a final answer (near-miss fences, prose, tool-less sessions, late callbacks, ungranted or malformed commands) keeps its bare text. Direct `toolExtractor(...)` assertions move from the old string/null contract to the result type (`kind: 'one'` with the expected `command`, or `absent`). No new commands, gates, fixtures, or protocol frames are introduced.

## Implementation steps

1. Change `toolExtractor` in `src/acp/tool-table.ts` to return the result type and delegate to the shared extractor with `allowQuestion: true`.
2. Change `src/acp/drive-loop.ts` to use `toolExtractor(tools)` for core and the shared extractor with `snapshot.askUser` for agent, and remove the temporary adapter and the old import.
3. Delete `src/agent/command-extract.ts` and `src/agent/command-extract.test.ts`; fold their cases into `src/acp/command-block.test.ts`.
4. Update the affected assertions and reply fixtures in `src/acp/tool-table.test.ts` and `src/acp/drive-loop.test.ts` for the block contract and the result type.
5. Apply the same fixture migration to the ten additional files named under Tests: re-express every bare command-line reply that must drive a command as a final fenced block with info string `janissary`, leave near-miss and negative fixtures as-is, and keep every gating, side-selection, step-count, and frame assertion unchanged.

## Tests

All twelve files below are in scope because the no-bare-line-fallback decision invalidates every fixture that feeds a bare command line as the model's reply. In every case the required change is the same: a reply that must produce a command becomes a final fenced block whose info string is exactly `janissary` (backtick or tilde fences), and everything the test asserts about gating, side selection, step counts, recorded/frame text, and final answers stays unchanged. Near-miss and negative fixtures — bare final lines, unlabelled fences, prose, tool-less sessions, late callbacks, ungranted or malformed commands — stay as-is; under the shared extractor they now yield `absent`/a final answer, which is what those assertions already expect.

`src/acp/tool-table.test.ts`:

- Core extraction now takes the command from the last closed labelled block; a bare command line outside a labelled block is not extracted. The `toolExtractor(...)` fixtures that expect a command (for example `'Let me look.\nbrowser goto x'` at :421 and the `web search`/`file read` cases at :444–:496) become fenced inputs; the `null`/`absent` cases at :113–:121, :450, :478–:485, and :515–:521 stay as-is and are updated only for the result type.
- Gating (`gateCommand`), refusal text, and caller/workspace side selection are unchanged by the extraction switch.
- Table order, primers, the allow-list, and the database fall-through behave as before.

`src/acp/drive-loop.test.ts`:

- Both core and agent-driven paths take the command from a labelled block; the agent path still passes `snapshot.askUser`, so a `question ask` line inside a block is only extracted when ask-user is enabled. Reply fixtures that drive the loop are fenced.
- The `janissary ` prefix is not required inside a labelled block but is tolerated and stripped.
- Gating, side selection, the 8-step core cap, and the uncapped agent path are unchanged from subplan 2.
- No test imports `src/agent/command-extract.js` any more.

`src/acp/manager.test.ts`:

- Direct `extractCommand` assertions that expect a command from a bare line — `first.extractCommand('question ask "Who?"')` at :150, `retry.extractCommand(...)` at :165, `next.extractCommand('db sqlite query store SELECT 1')` at :181, `dependencies.extractCommand('question ask "What port?"')` at :209, and `deps.extractCommand('question ask "What port?"')` at :251 — pass a final `janissary` block around the same command and keep their `kind: 'one'`/`command` assertions.
- The `absent` assertions at :151, :183, :234–:236 and :643–:644 stay as-is, including the tool-less-session case at :234.

`src/acp/plugin-session.test.ts`:

- Every `handlers().onChunk(...)` reply that feeds a command the loop must run becomes a fenced block: `browser goto https://example.com` at :106, :171 and :197, `db sqlite list` at :216, `question ask "ACP request"` at :143 and :756, `question ask "What port?"` at :234, and `subagent {"role":"research","task":"task.md"}` at :921.
- The repeated command replies in the 8-step cap at :524–:529 and the restricted-role refusals at :552–:563 (`browser goto https://example.com`, `browser eval document.title`, and the `Partial answer\n...` final turn) are fenced the same way; keep the trailing prose outside the block.
- Keep the tool-less-session prose reply at :832 (`Reading the output now.\nbrowser goto https://example.com`), the late-callback suppression at :259, and the final-answer chunks (`done`, `reply`, `primed`, `[[tab:shell]] First.`) as-is; fence the ordinary-session contrast at :851 so `browser.run` still fires.
- The recorded tool-entry assertions (`input`/`output` around :116–:123, :186–:209, :248, :568) stay unchanged: they check the extracted command, not the raw reply.

`src/acp/record-feed.test.ts`:

- `f.chunk('file grep TODO')` at :353 and the far-side frame fixture `listener.onChunk('file grep TODO')` at :389 become fenced blocks so the local and far-side grep steps are still recorded at :360–:366 and :400–:406.
- `far.reply(0, grep)` at :436 and `far.reply(1, read)` at :448, with `grep`/`read` defined at :427–:429, wrap those commands in final blocks; the follow-up text assertions at :438–:445 stay unchanged.
- Prose chunks (`found it`, `answer`, `partial`, `new`) stay as-is.

`src/acp/run-prompt.test.ts`:

- The `reply(providerPrompt, ...)` calls that drive real-loop commands become fenced: the complete flags-first grep at :1172–:1177, `GREP` at :1259, :1319, :1375, :1392, :1395 and :1431, `read` at :1327, and the subagent lines at :1642, :1659, :1674 and :1690 (including the wrong-flags, malformed-JSON and valid-JSON variants). Keep trailing answer prose outside the block.
- The `runCommand('file grep')` usage case at :1195 is a direct dispatch, not a reply fixture, and stays as-is. The abort-before-end fixture at :1414 (`handlers.onChunk(GREP)` followed by `request.abort.abort()`) also stays as-is: extraction never runs, so it is not a bare-line reply that needs a block.
- The `absent` assertions at :409, :440 and :644 and the final-answer replies (`Done.`, `Found ...`) stay as-is; keep the 8-step cap and abort-suppression assertions unchanged.

`src/native-commands/feature.integration.test.ts`:

- The direct `toolExtractor(tools)('browser content')` assertion at :150 becomes a fenced input and asserts the result type (`kind: 'one'` with `command: 'browser content'`) instead of the old string return; the settings-projection assertions around it stay unchanged.

`src/remote/serve-acp-loop.test.ts`:

- The `makeSession(turns)` reply arrays that drive commands become fenced: `file read a.md` at :179 and :228, `web search x` at :196, `web fetch` at :208–:211, `QUERY` at :264, :290–:342, `WRITE`/`PATCH` at :567–:600 and :661, `file glob *.md` at :676–:690, `GREP` at :707–:804 and :857, and the held-run `run.last().onChunk(...)` calls at :475, :498, :600, :871, :885 and :1041.
- The agent fixtures that prepend the old `janissary ` marker to a bare line — `start([['janissary file read a.md'], ...])` at :273 and :388, `['janissary db sqlite list']` at :396, `['janissary /file read a.md']` at :412, and `['janissary file grep TODO']` at :428 — become fenced blocks whose info string is `janissary` and whose content is the plain command. Keep the gate refusals, leading-slash strip, caller requests, `workspace` flags, frame order, and step-count assertions at :276–:277, :391, :399, :412, :432, :364 and :857 unchanged.
- Keep the late/abort chunk at :465 (`onChunk('late')`) and the final answers (`Done.`, `The answer.`) as-is; no new frame type — the existing `acp-turn`, `acp-chunk`, `acp-tool-step` and `acp-tool-request` assertions stay unchanged.

`src/remote/serve-acp.test.ts`:

- `lastHandlers().onChunk(...)` replies that drive commands become fenced: `file read which.md` at :330 and :339, `file read a.md` at :482, and `db sqlite query movies SELECT 1` at :490, :581, :642, :681 and :726.
- Keep the workspace-selector, caller-request and run-end assertions at :333–:344, :486–:501, :588, :687 and :736 unchanged, and leave the `Done.` chunks at :503, :552, :567 and :599 as-is.

`src/remote/serve.test.ts`:

- `handlers.onChunk('db sqlite query movies SELECT 1')` at :428 and `handlers.onChunk('file write {"path":"mutated.txt","content":"written in clone"}')` at :674 become fenced; the caller-request and workspace-selector assertions around them stay unchanged.

`src/subagent/attempt.test.ts`:

- `scriptedSession([['file read a.md'], ...])` at :270 and `scriptedSession([['file read a.md']])` at :284 must fence the command turn; the feed/activity assertions at :273–:277 and :288 and the workspace-run call stay unchanged. The `''`/`'file read x.md'` `endTurn` cases at :314 stay as-is (they assert `replied: true`).

`src/subagent/integration.test.ts`:

- `answer(0, 'file read x.md')` at :275 and the ninth capped turn `answer(0, 'file read x.md\neight commands done')` at :276 become fenced command blocks, with `eight commands done` left outside the block as the final-answer prose; the capped-final-turn assertion for `Partial` with no explanatory suffix stays unchanged. The human-dispatch and ACP-caller-delivery fixtures around :164 and :356 stay as-is.

`src/acp/command-block.test.ts`: add the folded agent cases listed under Design decisions. `src/acp/command-line.test.ts` stays unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each change. Typecheck must stay green after removing the old module and the temporary adapter. Grep for `extractAgentCommand`, `command-extract`, and the old `findLastCommandLine` call in the loop path to confirm no call sites remain. Confirm `src/acp/tool-table.ts` is still under 200 lines and that no remote frame type changed; tests are exempt from `max-lines`, so fenced fixtures do not need extracting into helpers.

Grep all twelve test files for a bare command-line reply that is still expected to run a command (a command string not preceded by a `janissary` fence) to confirm none remain, and spot-check that the near-miss and negative fixtures listed under Tests were not rewritten into positive ones. As the end-to-end check, run `npm run test:server` once and confirm the whole suite is green — in particular the twelve files named above — since `check-diff` is scoped to the uncommitted working tree and can hide a fixture sweep that missed a file.

## Out of scope

- Rewriting the two primers or updating the specs; subplans 4 and 5.
- Changing `cleanCommandLine`, `findLastCommandLine`, or the three legacy whole-reply extractors.
- Changing the label, the correction sentence, the 8-step cap, the gate, command permissions, or adding a bare-line fallback.
- Rewriting what a test asserts or adding new command fixtures: the fixture migration only re-expresses the model's reply as a labelled block so the existing gating, side, step-count, frame, and final-answer assertions still hold. Near-miss and negative fixtures remain negative.
- Adding a second command per turn or any client/server protocol change.
