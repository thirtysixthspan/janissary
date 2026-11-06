# Keep ACP command refusals to one reply

**Complexity: 4/10** — coordinates the ACP manager's early-refusal output with both shell command wrappers and needs integration coverage for role and remote refusal paths.

## Goal

Ensure shell `ask` and `tell` refusals settle as one background reply while direct ACP API callers retain the manager's existing transcript result.

## Decisions

- `AcpManager.run` remains responsible for publishing early refusal entries by default, preserving `run`, `prompt`, and `promptResult` behavior for direct ACP API callers and existing tests.
- The shell `ask` and `tell` wrappers own their settled background reply. They will opt out of the manager's immediate transcript append for synchronous usage, no-model, same-role-running, and remote-still-connecting refusals.
- Apply the same output policy to `ask` because it uses the same manager path and background-reply wrapper; the change preserves its expected single-reply behavior as well.
- The existing ACP spec already promises one background reply for shell usage and refusals. Keep it unchanged unless implementation review finds that promise does not cover the corrected behavior.

## Existing code to reuse

| What | Where | Reuse |
| --- | --- | --- |
| Synchronous refusal and no-model handling | `src/acp/manager.ts` (`promptResult`, `run`) | Keep direct API transcript output as the default and let shell commands opt out for these branches |
| ACP transcript and background-reply paths | `src/acp/response.ts` (`appendAcp`, `appendAcpBackgroundReply`) | Preserve the existing destination chosen by each caller |
| Shell ask/tell result publication | `src/commands/ask.ts` and `src/commands/tell.ts` (`promptResult`, `settle`) | Publish one completed reply beneath the exact typed command line |
| ACP manager fixtures and model/remote setup | `src/acp/manager-fallback.test.ts` (`setup`, role refusal tests) | Exercise the actual manager and command wrappers together and assert the tab receives one entry |
| Public API result behavior | `src/acp/manager.test.ts` and `src/acp/plugin-session.test.ts` | Preserve direct manager/plugin transcript behavior and returned refusal text |

## Proposed changes

### Manager and shell callers

- Add an optional prompt-result output option to `AcpManager.promptResult`, defaulting to the current immediate transcript append for synchronous refusals. Pass that option into `run`; only the early refusal/no-model branch consults it.
- In `src/commands/ask.ts` and `src/commands/tell.ts`, pass the option that suppresses the immediate transcript append. Their existing settlement callbacks remain responsible for the single background reply.
- Do not change errors emitted after a provider attempt starts, fallback notices, prompt cancellation, reset, or connection-close settlement.

### Tests

- In `src/acp/manager-fallback.test.ts`, add integration coverage using the real `AcpManager` with the ask and tell command wrappers. For `tell`, cover bare usage, an empty enabled model queue, a second prompt while tell is active, and a remote shell whose channel is not attached. Assert each settles through exactly one background entry and creates no duplicate inline refusal entry.
- Add ask command parity coverage for its early refusal path because it uses the same option.
- Confirm the manager's default `promptResult` refusal path still appends one ordinary transcript result and returns the same `AcpPromptResult` to direct callers.
- Keep existing command unit tests, direct `run` refusal tests, successful prompt, cancellation, reset, fallback, and remote-attach tests passing.

## Specs and documentation

- Verify `product/specs/acp.md` still accurately states that shell `ask` and `tell` usage and refusals produce one completed background reply. No help or user-documentation change is needed because their expected command output remains unchanged.

## Verification

- `./scripts/run.mjs check-diff` passed lint and typecheck. Its server-test phase returned `test:server ✗` without diagnostics on the final runs. The directly related manager and command tests passed: 51 tests across three files; `npm run test:diff:server` passed all 853 tests across 40 files.
- The integration tests prove the settled result content and the single `tab.append` output path for each covered refusal; the direct API test proves its transcript behavior remains intact. `git diff --check` passed.
- Confirm the working tree contains only the files named by this plan plus its promotion and the selected backlog entry removal.

## Out of scope

- Changing successful prompt or provider-error presentation, which may use transcript entries before settlement.
- Reworking ACP transcript storage, shell rendering, or command dispatch.
- Updating the PR title or addressing any other backlog entry.
