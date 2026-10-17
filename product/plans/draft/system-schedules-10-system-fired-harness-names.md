# System schedules 10: system-fired harness name postfixes

**Complexity: 4/10**

This is a narrow policy over existing local/remote naming gates once 08/09 deliver provenance. The main checks are creator attribution and preserving refusal behavior outside scheduled launches.

## Goal

Let a harness launch originating in a system schedule choose the smallest free `-N` postfix, while typed and profile launches retain their refusal behavior. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: 08 and 09 for immutable server-derived invocation provenance reaching ordinary command dispatch; 01 supplies reserved-name enforcement. Tests inject structured rows through these completed seams, without needing future schedule or execute commands.
- Only `invocation.systemSchedule` enables this policy. Running a typed harness command in the system tab, manually executing a runscript, sending/queueing to system, or a tab timer targeting `in system` is not a system-schedule firing.
- Use the existing suffix candidate sequence (`base`, `base-2`, `base-3`, ...), checking case-insensitive open tabs, live/detached/provisioning/reconnecting session rows, and running local/remote workspaces through existing gates. Pick the smallest free number from 2 on a clash. Keep invalid labels, reserved `system`, failed cleanup, authentication/root failures and other non-clash refusals intact.
- Pass the actual invoking label/cwd/group into `HarnessManager.run/open`; a hidden queue must not use `managers.tab.cur()` as its creator just because another visible tab has focus. This also keeps notices attributed to the correct command caller.
- Preserve policy and base name through remote collision retries. `openFromProfile` always uses explicit-name refusal, including a profile launched by a scheduled line. `with <prompt>` injection remains the existing one-shot tab schedule and carries no naming metadata into the harness prompt.
- Keep remote session attachment separate from a new scheduled launch. Current master reattaches parked sessions on every startup and already disambiguates restored tab labels; this policy must not reinterpret that path as a system firing. Remote retry's existing `relaunch` callback means retrying one launch, not a removed CLI option.

## Existing code to reuse

`src/launch-name/{check,local,fail-remote}.ts` already distinguish explicit refusal from candidate selection. `HarnessManager.open` has remote retry plumbing, and `commands/harness.ts` is the single registry entry. `profile/harness-schedule.ts` owns prompt injection.

## File scope

- `src/commands/harness.ts`, `src/harness/manager.ts`, `src/harness/{spawn-options,remote-launch}.ts`, `src/launch-name/{check,local,fail-remote}.ts`; new `src/harness/launch-origin.ts` for the narrow creator/naming-policy input. Anticipated extract `src/harness/open-launch.ts` if launch orchestration pushes manager over 200 lint-counted lines; move all direct importers with it.
- Tests: existing `src/harness/{manager,remote-launch}.test.ts`, `src/launch-name/{check,local,fail-remote}.test.ts`, `src/profile/{agent-opener,manager}.test.ts`, and unchanged `src/sessions/{manager,harness-roundtrip}.test.ts` for attachment regression; new `src/commands/harness.test.ts` and `src/harness/system-schedule-launch.integration.test.ts`.
- Specs/docs: `product/specs/{scheduling,harness,notifications,profiles}.md`, relevant harness-name reference text in `documentation/user-documentation/advanced-agents/harness.md`.

## Ordered changes

1. Introduce a narrow invocation-origin input for harness launches; use it for creator selection without changing profile launch APIs.
2. Convert only system-schedule explicit name collisions to suffix candidates. Keep label validation and reserved-name checking before candidate selection.
3. Carry the creator, base label and policy through remote retry callbacks. Leave unrelated failure/cleanup behavior and prompt injection intact.
4. Add comparative tests and update the exact scope of the naming exception in specs.

## Tests and verification

Test base free, base held, gaps (`name-2` held and `name-3` free), case-insensitive collisions, session rows, running workspaces, simultaneous/sequential scheduled launches, reserved/invalid labels, and remote retry choosing the next smallest free candidate. Compare typed, typed-in-system, ordinary string queue/tab-timer dispatch, and `openFromProfile` against the same clash; all must keep refusal. Verify the creator's cwd/group/notice attribution and unmodified `with` prompt. Actual manual `execute` regression belongs to 13 and the complete scheduled-command path to 16, so neither is a prerequisite here.

Run `./scripts/run.mjs check-diff`. Scope E2E drives a system-origin queued harness line through the real shell plugin receipt and command registry into the real naming checks and tab creation; use a deterministic fake harness process at the spawn boundary so no provider session is required. Keep the visible tab elsewhere and assert the system creator, then repeat as typed/profile launches and assert refusals. 16 repeats the full scheduled path after the owner exists.

## Boundaries

No general auto-rename policy, no shell-name postfix change, no source grammar change, and no profile rename exception. Recurring system firing is made possible by 11; the existing tab-schedule recurring-spawn boundary remains.
