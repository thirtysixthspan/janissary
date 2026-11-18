# Subagent grammar and primers
**Complexity: 5/10** — ~150 added production lines, 0 existing files, 10 requirements, 24 scenarios, 8 new units (p=5.59)

## Goal

Add pure `parseSubagentCommand(text)` returning the chosen form, role, task, optional context, or the exact usage error. A trimmed argument starting with `{` selects JSON; anything else selects flags. Bare input and all flag failures use `Usage: subagent --role <role> --task <file.md> [--context <text>]`; JSON failures use `Usage: subagent {"role":"<role>","task":"<file.md>","context":"<text>"}`.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 1 of 23.

## Decisions and dependencies

Dependencies: None; this unit is independently implementable against the current repository.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

`src/agent/command-parser.ts:88` (`parseAgentCommand`) supplies parser conventions; `src/command/quoted-token.ts:16` (`skipSpaces`) and `src/command/quoted-token.ts:22` (`readToken`) already handle quoted flag values and escaped matching quotes without I/O. `src/acp/command-line.ts:6` (`cleanCommandLine`) and `src/acp/command-line.ts:12` (`findLastCommandLine`) own reply-line cleaning; the new predicate consumes an already-cleaned line and does not duplicate extraction. `src/acp/loop.ts:39` (`promptOnce`'s `sent`) prepends the tool primer.

## Planned file scope

New `src/subagent/parse.ts`, `src/subagent/primer.ts`, `src/subagent/parse.test.ts`, `src/subagent/primer.test.ts`; new `product/specs/subagent.md` with grammar, messages, and boundaries only.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Add pure `parseSubagentCommand(text)` for the resolved full command line, including its case-insensitive `subagent` token. Strip that token once, then choose JSON when the trimmed argument starts with `{`; anything else selects flags. Return the chosen form, role, task, optional context, or the exact usage error. Export `SUBAGENT_FLAG_USAGE` as exactly `Usage: subagent --role <role> --task <file.md> [--context <text>]` and `SUBAGENT_JSON_USAGE` as exactly `Usage: subagent {"role":"<role>","task":"<file.md>","context":"<text>"}` from parse.ts. Bare input and all flag failures use the former; JSON failures use the latter. Plan 20 consumes these two semantic exports for its caller-kind override without duplicating text or choosing different export names.

2. Accept only `--role`, `--task`, `--context` and the JSON fields `role`, `task`, `context`. Scan the flag form with the existing quoted-token helpers, in any flag order, so a role such as `"code review"` and context containing spaces are single values; malformed quoting is a flag usage error. Reject unknown/repeated flags, missing values, extra positional tokens, unknown JSON fields, non-string values, invalid JSON, and missing/whitespace-only role or task. Reject removed model/effort fields and flags. Keep JSON decoding typed as unknown until validated. Preserve the decoded role, task and context string contents; use trimming only to validate required strings, with canonical role lookup deferred to plan 20. Context may be omitted or be an empty string. An argument beginning `[` or a JSON scalar follows the flag branch and receives flag usage because form selection happens before decoding.

3. Add import-light `SUBAGENT_PRIMER`, `isSubagentCommandLine(line)`, and `subagentTaskPrompt(taskText, context?)` beside it. The predicate accepts a case-insensitive first token exactly equal to `subagent`, whether bare or followed by whitespace and any suffix, including flags and malformed JSON; it rejects lookalike command names. It neither parses arguments nor imports managers. The caller primer teaches one-line JSON with embedded newlines escaped, empty immediate output, and later JSON prompts: started has status, canonical role, sessionId and callerId; completion has status, sessionId, callerId and output. Session IDs are provider IDs, failed completion may have null sessionId, started may be skipped when its completion overtakes it, and completion statuses are completed, partial, failed or terminated. Explain started as running in the background, completed as successful, partial as stopped at the tool-loop limit, failed as the source error, and terminated as stopped. It lists no roles and reads no role descriptions.

4. The execution lead-in is a distinct text: identify a subagent and ask for a self-contained final result for its launching agent, followed by task text then optional context. The loop supplies command primers itself; do not duplicate `corePrimer` in the task prompt. No summarizing turn or output cap.

## Tests

Parser table tests cover both valid forms, optional/empty context, quoted role/context and escape preservation, every listed invalid class, both named usage exports and their exact text, and leading-brace selection (including array/scalar input choosing flags). Primer tests cover the predicate's bare/wrong-form/malformed-JSON cases and lookalike rejection, field grammar and escaped newlines, all asynchronous message/status meanings and rules, no role inventory, and verbatim task/context ordering. Caller-kind enforcement belongs to plan 20; tests here invoke no command registry or future delivery API.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Inspect parser outputs for valid flag/JSON examples and removed model/effort inputs through its colocated tests; the public command is intentionally unwired.

## Out of scope

No registry, grants, launch, I/O, caller-kind policy, models, skills, host/workspace selectors, nesting, monitor tab, status/cancel command, restart delivery, or concurrency cap.

## Canonical requirement coverage

The unchanged source is `product/plans/complete/subagent.md` (original 9/10, blob `59f6422eac2688b629bca411e1db0e8e719945b0`). The following map preserves the full source requirement inventory and records the final coverage check. Shared rows list contributing units; the final number does not supersede another unit's contract. The filename index fixes the numbering against the final ready sequence; unit 1 is this document until promotion. These references are a feature coverage inventory only. They add no later production work, dependency or quantitative count to this parser/primer unit.

| Unit | Final filename under `product/plans/ready/` |
| --- | --- |
| 1 | `subagent-1-grammar-and-primers.md` |
| 2 | `subagent-2-known-role-settings.md` |
| 3 | `subagent-3-record-naming.md` |
| 4 | `subagent-4-partial-outcome.md` |
| 5 | `subagent-5-local-provider-session-ids.md` |
| 6 | `subagent-6-remote-provider-session-ids.md` |
| 7 | `subagent-7-fresh-run-workspaces.md` |
| 8 | `subagent-8-workspace-loop-foundations.md` |
| 9 | `subagent-9-caller-invocation-context.md` |
| 10 | `subagent-10-record-receipt-markers.md` |
| 11 | `subagent-11-delivered-prompt-echoes.md` |
| 12 | `subagent-12-delivery-state-and-ownership.md` |
| 13 | `subagent-13-session-bound-delivery.md` |
| 14 | `subagent-14-remote-clone-service.md` |
| 15 | `subagent-15-remote-clone-frames.md` |
| 16 | `subagent-16-remote-workspace-selectors.md` |
| 17 | `subagent-17-single-entry-execution.md` |
| 18 | `subagent-18-role-fallback-execution.md` |
| 19 | `subagent-19-background-launch-lifecycle.md` |
| 20 | `subagent-20-command-policy-and-replies.md` |
| 21 | `subagent-21-native-command-integration.md` |
| 22 | `subagent-22-tell-default-grant.md` |
| 23 | `subagent-23-end-to-end-verification.md` |

| Source design decision or edge case | Owner(s) |
| --- | --- |
| Two forms, fields, strict unknown/repeated/missing/non-string input, removed model/effort, form-specific exact usage | 1, including `SUBAGENT_FLAG_USAGE` and `SUBAGENT_JSON_USAGE`; caller-kind override 20 |
| ACP callers, grant vocabulary, tell default, saved grants, plugin ask parity | 21, 22; session parity 13 and 23 |
| Human asynchronous flow, exact Markdown wording, canonical role, no session IDs | 12, 19, 20, 21 |
| acpTool caller-kind rule; other dispatchers are people; acpRole propagation | 9, 20 |
| No nesting; subagent tool/primer/extractor exclusion; ordinary agent whole-command refusal with/without skills | 17, 20, 21 |
| Empty immediate ACP success, immediate pre-run refusals, global disabled gate never reaching run | 20, 21 |
| Started/completion JSON, actual provider IDs, caller IDs, no Janissary-minted substitute | 5, 6, 12, 18, 19 |
| Prehandshake clone/task/all-model failure, null ID, no started, exact failure output | 7, 18, 19 |
| First-only started and latest completion ID across fallback | 18; one resource/current lease slot consumes 17's idempotent lease, and a later prehandshake failure never erases the latest observed ID |
| Deliver exact one-line JSON as new caller-role prompts, ordinary answering background replies | 11, 12, 13; exact JSON is the complete logical input, while the first raw provider prompt retains normal `corePrimer` wrapping |
| Per-role FIFO; own queued started dropped by completion; one prompt per message; typed busy refusal | 12, 13; completion appends at the tail, symbols own flight/drain work, and a two-microtask drain preserves inline reply publication order |
| Session end/reset/dead model/caller fallback/catalog removal clears queue and terminates matching subagents | 12, 13; canonical `TabRuntime.acpRoles` uses `AcpRoleRuntime`, holder closing invalidates identity, and admission repeats after `queueFor` before any stale prompt/refusal publication |
| Tab close/reincarnation/closing check and stale captured identity at execution; shutdown dropping delivery | 12, 13, 19 |
| Caller primer grammar/meaning, no role inventory/descriptions; distinct task lead-in | 1 |
| Final display text verbatim, empty completed answer, no thoughts/tool output/summarizing turn/size cap | 1, 17, 18 |
| Eight-command cap produces partial with no stopped-after suffix | 4, 17, 18 |
| Failed error unchanged; terminated output Subagent terminated; record outcome wins cleanup | 4, 18, 19; only a recorded terminated outcome overrides failure, and unexpected executor rejection internally aborts owned work without replacing failed status/error |
| Role command/model limits; every file grant against clone only; root-taking shared runners | 2, 8, 17 |
| Enabled models in role order, any harness, stored effort launch, pre-endTurn fallback only | 2, 17, 18 |
| Case/trim/canonical role lookup, project/home/default precedence/read-fresh/no create, empty/unknown errors | 2, 20 |
| Task lookup after run in fresh origin clone, installed fallback, unknown/ambiguous/out-of-bounds/uncommitted-only | 7, 16, 19 |
| Unlimited concurrent runs; fresh same-machine local/remote execution, no borrowed caller tree | 7, 14, 15, 16, 19 |
| Shared agent run identity/resources/incarnation/durable record/popup/Terminate, immediate record receipt | 3 explicitly projects the captured durable title in `activeAgentRows`; 7 publishes a synchronous fresh run/record before deferred clone startup; 12 owns frozen internal-only `acpCaller`; 19 forwards it through local helper options before publication and returns the receipt synchronously |
| No invocation.signal linkage, caller prompt may finish without ending subagent | 19 |
| Local session cwd/confinement/offline/env/sessionMeta, no autonomous/provider permission; remote lazy first prompt | 17; standalone one-entry driver owns allocation/abort/finally and idempotent attempt lease, buffers synchronous constructor callbacks, and starts the first remote run without awaiting normal readiness |
| Core snapshot ask role/name/grants/settings/withoutTools, shared row helper and native caller dispatch | 8, 9, 17 |
| One native application row, no BUILTIN_FORMS/parent, owner validation/tool-table order and predicates | 21; omit the empty derived parent in native inventory generation, preserving multiword parents and strict payload guards |
| Provider callback only, timing before effort, CoreSession holder guards, optional remote acp-ready report | 5, 6; addressed `acp-session-started` reports immediately before effort, optional ready ID remains a once-only fallback, and ID observation never advances readiness/onConnect timing |
| Fresh helper options and legacy launchAgent caller; symmetric clone/provision/ACP release | 7, 17, 18, 19; 19 uses registration-order cleanup, ends provisioning allocations before waiting on readiness, and places ready-clone release after an execution-only barrier and ACP cleanup, with channel lease last |
| Record source/title/row/name subagentRole validated nonempty, never non-ACP role | 3 |
| Partial everywhere including guards, terminal lock, connection ended/muted/closed spacing/sort | 4, including existing agent-monitor termination-disabled compatibility only; no subagent monitor is launched |
| Human two-reply placement, background IDs/records, ACP_INPUT classification and refusal no marker | 10, 12, 19, 20 |
| Record receipt union/twins/guards, open newest durable history, Thinking then see thought process | 10 |
| Delivered echo/role metadata through pending-name push, unseen marker and normal settlement, no new capability | 11 extracts cohesive marker state/helpers into `reply-markers.ts` before adding echo rendering; 13 supplies logical prompt/echo and ordinary answering-record settlement after admission, with stale drops distinct from admitted fallback/refusal |
| Marker tooltip/accessibility/one-cell placement/alternate buffer/reload/dock lifetime; keyboard popup route | 3, 10 |
| Remote run-clone service with merged tokens/shallow options, not main provisioner, shutdown removal ceiling | 14 owns `RemoteFrame`-typed `dispatchAcpFrame`, pending-clone cancellation/drain and guarded shutdown removal; provisioned detach retains pending/ready clones until successful far-side shutdown |
| Remote frame types/catalogs/decoders/dispatch, one channel method, failAll, unbounded create/15s release | 15 extends 14's dispatcher, owns action-aware tracked create/release validation and mixed-family correlation, registers before send, settles send throws and every close/fail/detach/loss path, and extracts navigator routing for the channel line budget |
| Remote selectors on acp-open/agent-resolve/options, directory per record/spawn/confinement/loop/task, fatal unknown | 16 injects bound lookup closures from the provisioned service, captures immutable per-record roots, preserves main-root omission, rejects unknown selected opens/resolution without fallback, and extracts unchanged ACP shutdown to `serve-acp-shutdown.ts` |
| Remote exact-version safety, rebase current version with file-patch/web-search; no hard plan dependency | 6 owns the single feature increment/comment and pinned version test; 15/16 extend that same unreleased version/comment without another bump; 21/22 rebase vocabulary and independent counts without protocol edits |
| Remote ready-clone retention after uncertain execution shutdown | 19's execution-only barrier precedes final release; any executor warning/rejection or uncertain close retains the clone for guarded far-side shutdown, without matching warning text or changing status/output |
| Source Specs/docs exact file list and tell count updates | Every behavior unit owns its same-unit spec; 21 owns command help/inventory/vocabulary; 22 owns default/saved-grant guarantees, the ACP default-count clause, tell help and user named-role consumption docs; 23 only reconciles completed documents |
| Source Tests list: parser/command/gates/executor/workspace/delivery/receipts/provider/remote/records/roles | Colocated tests in 1–22; cross-boundary scenarios 23 |
| Source Verification orchestrator/human/reset/unknown-role scenario plus remote and plugin parity | 23 adds integration tests/controlled fixtures and implementation-time manual verification only; a seam needing production fixes is reported to its earlier owner |
| All nine source out-of-scope decisions and thin client/server state ownership | Enforced in every unit's boundaries; integration/reconciliation audit 23 |

Source Proposed changes are allocated by their subsection: Vocabulary/grants to 9/17/20/21/22; Command/parser to 1/2/5/9/19/20/21; Launch/execution to 3/4/7/8/12/17/18/19; Provider IDs to 5/6; Delivery to 11/12/13; Human replies to 10/11/12/19/20; Records to 3/4; Remote callers to 6/14/15/16/19; Specs/docs to each behavior owner and final reconciliation in 23. The source's mechanical work order is refined to put usable delivery and receipt contracts before entrypoint launch wiring. Its popup-label assumption is corrected by 3's explicit projection, its ready-only ID report by 6's earlier notification, its delivery sketch by 13's post-filter admission and owned scheduling, and its cleanup sketch by 17–19's independent driver/lease/barrier ordering. These mechanical corrections preserve the source's behavior and exclusions. Plan 6 owns the feature's single protocol increment; clone frames in 15 and selectors in 16 extend the same unreleased version/comment. Rebase that one increment on the current version if other features land first.

The nine feature exclusions remain no nesting, per-launch model/effort overrides, subagent monitor, skills, host/workspace selection, caller-agent status/cancel command, restart delivery, concurrency cap, or role inventory in the primer. Terminate remains available through the existing connection tab. No extra summarizing turn or output size cap is added. Run, record, queue and status stay server-owned; existing client surfaces render their projections. Every source requirement, edge and exclusion retains an owner above; plan 23 verifies their seams without inheriting production implementation from earlier units.
