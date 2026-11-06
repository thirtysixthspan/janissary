# ACP prompt isolation and role orchestration

**Complexity: 5/10** — threads role identity through prompt orchestration and prevents concurrent role streams from updating or settling one another's transcript entries.

## Goal

Allow one ask prompt and one tell prompt to run independently on the same tab, using separate sessions, histories, model fallback, cancellation, and records, while each stream updates only its own transcript entries.

## Decisions and dependencies

- Depends on `role-keyed-acp-session-state.md` and `role-based-acp-tool-filtering.md`.
- `AcpManager.start`, `prompt`, `promptResult`, `run`, and `cancel` take an optional role defaulting to `ask`. Existing plugin callers remain unchanged and run as ask.
- `run` strips the role's own command word before sending the prompt to its model: `ask` strips `^ask\b`, and `tell` strips `^tell\b`.
- Each role keeps its own session identity, model, prompt history, pending request, and durable record id. Closing the tab, shutting down, a plugin failure, or remote transport loss closes both role sessions; an explicit cancel or reset acts only on its selected role.
- Resolve each role's entries and commands at prompt time. A missing role uses its built-in defaults; an existing role with an empty model list uses default models but retains its own command grants.
- An overlapping prompt is refused only when the same role already has a pending prompt. Ask and tell may run together. Cancellation and reset address only their role.
- Each pending prompt retains the set of transcript entries it appended, carrying the set forward through immutable entry replacements. `RunningEntryMatch` can restrict lookup to that set; streaming updates and settlement use that restriction so another role's last running entry is never selected.
- Keep the tab busy while either role has a pending prompt, clearing it only after both roles settle.
- A role with no enabled entries refuses using `ACP: the <role> role lists no models.`. When multiple models in a role fail, the exhaustion line names that role. Existing fallback notices and one-entry failure behavior remain unchanged.
- This subplan exposes and tests the role-aware ACP orchestration directly; the shell `tell` command and its user-facing primer are introduced in the next subplan.

## Existing code to reuse

- `src/acp/manager.ts` owns prompt reservations, model fallback, cancellation, and settlement.
- `src/acp/session-manager.ts` provides the role-specific sessions from the preceding subplan.
- `src/tab/transcript/events.ts` carries ACP ownership through immutable running-entry replacement.
- `src/acp/response.ts` settles the pending request and currently finds the last running ACP entry.
- `src/acp/ask-role.ts` provides the named role model and command settings.
- `src/remote/protocol-frames.ts` already keys ACP frames by per-session id; remote ask and tell can share a channel with separate session ids and need no new protocol frame type.

## Proposed changes

- Thread role through the manager, session lookup, `runCorePrompt`, fallback and cancellation paths, with ask as the default.
- Move attempt and settlement helpers to `src/acp/attempt.ts` if needed to keep `src/acp/manager.ts` under 200 code lines.
- Add per-prompt transcript-entry identity to pending prompt state and allow `RunningEntryMatch` and `updateRunningEntry` in `src/tab/transcript/events.ts` to match only those entries.
- Make `src/acp/response.ts` settle the role's own prompt and clear tab busy state only when no other role prompt remains.
- Update the ACP spec for independent same-tab prompts, role-scoped refusal/cancellation, and prompt-local transcript updates.

## Tests

- Extend `src/acp/manager.test.ts` for separate role identities, histories and records, same-role overlap refusal, cross-role concurrency, role-local cancel/reset, and `withoutTools` applying to both roles. Extend lifecycle coverage for closing both roles on tab close, shutdown, plugin failure, and remote transport loss.
- Extend `src/acp/manager-fallback.test.ts` for role-specific exhaustion wording and fallback order.
- Add a focused test beside `src/acp/record-feed.test.ts` proving simultaneous role streams and settlements update only their own entries and keep the tab busy until both settle.
- Extend transcript event tests for matching and carrying prompt-entry identity through replacement.
- Extend remote ACP coverage to prove both role sessions retain distinct per-session ids over the same remote channel without changing the frame contract.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after each implementation change and after tests.
- Confirm both role paths settle once, each retains its own model/session/record, and the tab becomes idle only after both pending prompts finish.

## Out of scope

- Adding the `tell` and `tell reset` command definitions or user-facing tell primer.
- Role-prefixed connection labels, connection lookup, or record-tab close routing.
- Changing session policies for monitors, conversations, or editor personas.
