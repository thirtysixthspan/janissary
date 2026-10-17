# System schedules 10: system-fired harness name postfixes

**Complexity: 4/10** — a narrow server-only policy crosses command invocation, local/remote harness naming, and retry behavior while preserving every ordinary launch refusal.

This is a narrow policy over existing local/remote naming gates after 08/09 deliver provenance. The policy applies only when the immutable server-created command invocation carries `systemSchedule`; the currently focused tab, command text, and system-tab label never establish that origin.

## Goal

Let a harness launch originating in a system schedule keep its requested base label when free and otherwise choose the smallest free numeric postfix (`-2`, `-3`, …). Typed and profile launches retain their refusal behavior. Source: `product/plans/ready/add-system-schedules.md`, “Harness name clash.”

## Decisions and dependencies

- Dependencies: completed plans 08 and 09 supply provenance in `CommandInvocationContext` and deliver the receipt-backed line through the ordinary server command dispatcher. Plan 01 reserves `system`; tests may inject structured rows through the completed receipt seam without future schedule/execute commands.
- Only the immutable `invocation.systemSchedule` on the invocation passed to the registered `harness` command enables suffixing. Do not add a caller-controlled origin argument, infer origin from command text, or read ambient/focused-tab state. Typed `harness` in the system tab, manual `execute`, `send`, ordinary `queue`, tab-owned schedule firing (including `in system`), and profile entry launch all lack this provenance and keep current behavior.
- Carry the invocation from `src/commands/harness.ts` into `HarnessManager.run` and its private `open` path. Use `invocation.caller.label` as creator and its captured cwd when choosing launch context; do not fall back to `managers.tab.cur()` for receipt-backed dispatch. Continue using the actual creator tab for group selection, and use the same creator for refusal/cleanup/root notices.
- Keep the shared name checker’s default explicit-name refusal unchanged for all other callers. For a proven system-schedule harness invocation only, treat the requested label (the harness name or explicit `as <label>`) as the base and use the existing `suffixCandidates` sequence after a clash. Retain case-insensitive tab/session/workspace checks and choose the first available candidate. Validate the original requested label and reject reserved `system` before suffixing; failed workspace cleanup, invalid labels, root/authentication failures, and all non-name-clash errors remain refusals.
- Carry the provenance-gated policy, original requested base label, and creator through `SpawnTabOptions.nameRetry` and each remote name-refusal retry. A retry is the same launch: skip every label already tried and choose the next smallest available candidate without changing creator or policy. Profile retry remains explicitly refusing and does not acquire schedule provenance.
- `openFromProfile` always uses explicit-name refusal, even when a profile launch command itself was receipt-backed. The existing `with <prompt>` one-shot tab schedule remains unchanged and receives no naming metadata.
- Remote attachment/reattachment is not a new scheduled launch. It has no naming retry contract and must not opt into this policy; restored tab labels remain governed by their existing restoration path.

## Existing code to reuse

`src/commands/types.ts` defines the immutable `CommandInvocationContext`; `src/command/manager.ts` constructs it from the host-owned receipt and copies it into child invocations. `src/launch-name/{check,local,fail-remote}.ts` already provide suffix candidates, collision checks, and remote refusal retries. `HarnessManager.open` owns local name selection and retry closure; `SpawnTabOptions.nameRetry` carries retry state to `remote-launch.ts`; `src/commands/harness.ts` is the single registry entry. `openFromProfile` is the independent explicit-name path, and `src/profile/harness-schedule.ts` owns prompt injection.

## File scope

- Sources: `src/commands/harness.ts`, `src/harness/manager.ts`, `src/harness/spawn-options.ts`, `src/launch-name/{check,local,fail-remote}.ts`. Do not add a second origin type or alter `CommandInvocationContext`; provenance already exists. Extract a focused module and update direct importers if a touched source would exceed ESLint’s 200-line `max-lines` limit; `src/harness/manager.ts` is already 213 raw lines, so verify the lint-counted limit before adding code and extract rather than compact if it crosses the limit.
- Tests: extend `src/harness/manager.test.ts` for invocation-to-open handoff, creator/cwd, profile refusal, and remote retry preserving the original base and origin; `src/launch-name/check.test.ts` and `src/launch-name/local.test.ts` for smallest-free suffixes, collision sources, and preserved refusals; `src/launch-name/fail-remote.test.ts` and `src/harness/remote-launch.test.ts` for retries. Add `src/commands/harness.test.ts` only if needed to exercise the command’s invocation forwarding. Keep `src/profile/{agent-opener,manager}.test.ts` and `src/sessions/{manager,harness-roundtrip}.test.ts` unchanged as comparative profile and attach/restore regression coverage unless a specific assertion must be added.
- Specs: update `product/specs/harness.md` “Name clashes” with the provenance-scoped scheduled-launch exception and leave typed launches, profile launches, and attachment behavior explicit. Update `product/specs/scheduling.md` “Scheduling a harness launch with a prompt” only to clarify that the dispatched scheduled launch gets the exception while its injected `with` prompt does not. No notifications, profile, user-documentation, client, storage, producer, or other policy changes are in scope.

## Ordered changes

1. Thread the existing immutable invocation from the registered command through `HarnessManager.run` to `open`, retaining captured caller identity/cwd and actual caller tab for grouping. Do not change the invocation constructor, receipt API, or profile opener.
2. At the harness name-selection call only, enable `suffixCandidates` for a system-schedule invocation; leave `resolveLocalLaunchName`’s ordinary explicit-name behavior unchanged. Validate the original requested label and reject reserved `system` before suffix candidate selection. A free base remains unchanged; only a real name clash selects the smallest free postfix.
3. Carry the origin-gated retry policy, requested base, and original creator through `nameRetry` and `SpawnTabOptions` so each remote name refusal retries the same scheduled launch past all tried candidates. Preserve refusal paths for all other failures and all profile launches.
4. Add comparative tests for every dispatch origin and local/remote collision path, then update only the harness and scheduling spec clauses named above.

## Tests and verification

Test a free base, an occupied base, gaps (`name-2` occupied and `name-3` free), case-insensitive tab/session collisions, a live workspace, and an explicit `as <label>` base. Verify reserved `system`, invalid workspace labels, failed cleanup, and non-name-clash errors do not become suffix candidates. Compare typed dispatch (including typed-in-system), `execute`, `send`, ordinary `queue`, tab-owned timers (including `in system`), and `openFromProfile` against the same clash; all retain refusal. Assert only receipt-backed dispatch has `systemSchedule`, and that no text, tab label, or caller-supplied data can forge it. Verify creator label/cwd/group and notice attribution remain those of the invoking tab even while another visible tab is focused. Verify `with <prompt>` is unchanged. Remote tests must prove retries skip every tried candidate while retaining the original requested base, policy, and creator; non-clash remote failures and attachment/reattachment do not retry as scheduled launches. Actual `execute` end-to-end coverage belongs to 13 and the complete scheduled-command path to 16; neither is a prerequisite here.

Run `./scripts/run.mjs check-diff`. Scope E2E dequeues a host-owned structured receipt through the real shell-plugin receipt capability and command registry, then reaches harness naming and tab creation; use a deterministic fake harness process at the spawn boundary so no provider session is required. Keep another tab visible and assert the system invocation’s captured creator, cwd, group, and postfix selection. Repeat through typed dispatch and profile opening and assert refusal. Plan 16 repeats the complete scheduled-command path after the owner exists.

## Boundaries

No general auto-rename policy; no change to ordinary typed/manual/send/queue/tab-timer dispatch, including a timer targeting `system`; no shell-name postfix change; no source grammar, store, schedule producer, client, or profile rename exception; and no change to other users of `resolveLocalLaunchName` or remote session restoration. Recurring system firing is made possible by 11; the existing tab-schedule recurring-spawn boundary remains.
