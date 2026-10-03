# Document the `in <tab>` clause a harness tab's auto-resume needs to be cancelled

**Complexity: 1/10** — three prose corrections and one pull request body edit. No code changes: the parser, `ScheduleManager.cancel`, and `src/commands/schedule.ts` are all correct as they stand.

## Problem

Three places told a user to run `schedule cancel auto-resume` to stop a pending resume. A harness tab has no command bar, and `schedule cancel` without an `in <tab>` clause operates on the *issuing* tab's own schedule — so from an agent tab it answers `No scheduled command "auto-resume".` A user who followed the documented step would conclude the entry was uncancellable, which is the opposite of the control the plan promised them.

The three places: the pull request body's "How to verify" step 9, the "Resuming after a usage limit" section of `documentation/user-documentation/advanced-agents/harness.md`, and `product/specs/harness.md`'s auto-resume section. (`product/specs/scheduling.md` documents the clause correctly already and is only cited for the reason, not changed for the command form.)

## Approach

State the full form — `schedule cancel auto-resume in <label>` — in all three, and say why the clause is there rather than leaving a reader to infer it: a harness tab cannot run commands itself, which is the same reason `product/specs/scheduling.md` gives for `in <tab>` being the only way to manage a harness tab's timers.

The user documentation keeps its own voice ("you cancel it from an agent tab with …"), because it is written for someone at a keyboard rather than for a spec reader.

## Tests

None: no behavior changes. The correctness of the claim is checkable by reading `src/commands/schedule.ts`'s `run`, which resolves the target from `parsed.target` and defaults to the issuing tab's label.

## Verification

`./scripts/run.mjs check-diff`, then the pull request body edit: step 9 names `schedule cancel auto-resume in codex` and says the `in <tab>` clause is what reaches a harness tab's schedule. `gh pr edit --body-file` only; the title and every other section stay as the author wrote them.