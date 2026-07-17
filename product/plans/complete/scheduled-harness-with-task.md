# Scheduled harness creation with an injected task

**Complexity: 3/10** — server-only, two touched modules (harness parser + launch path) plus specs and tests, with no new protocol, web, or persistence surface. The number is driven by two correctness subtleties rather than volume: the `with` clause must be split off before option parsing, and the injection relies on the existing schedule-firing retry timing — both reuse mechanisms already in the repo.

Let a harness launch carry an initial prompt that is typed into the new harness once it is running, and — because launching is an ordinary command — let that whole action be scheduled for later. Today a harness launches empty and the user (or a profile's `run` field) has to feed it its first instruction separately; there is no one-shot way to say "at 5pm, spin up a fresh Claude and tell it to fix the failing tests." This feature adds a `with <prompt>` clause to the `harness` command: `harness claude with fix the failing tests` launches the harness and injects that free-text prompt immediately, and `schedule deploy at 5pm harness claude with fix the failing tests` does the same at the scheduled time. The injection reuses the exact mechanism a profile's `run` field already uses — a one-shot schedule entry on the new harness tab that the scheduler types into the PTY once the harness is ready, retrying until it is.

## Design decisions

- **Grammar.** Extend the `harness` command with a trailing `with <prompt>` clause: `harness <name> [as <label>] [-w] [--offline] [-y] [--model <m>] [--effort <e>] with <prompt text>`. The `with` keyword comes after the existing options; everything after it, to end of line, is the prompt (internal spaces preserved verbatim). The keyword is `with`.
- **Free-text prompt.** The injected content is arbitrary free-text the user writes — not an `ai/tasks` task or a task-picker selection. No task-picker integration in this feature.
- **Empty prompt rejected.** `with` followed by no text is a usage error; the command is not run and no empty prompt is injected. (A plain `harness <name>` with no `with` clause launches empty exactly as today.)
- **Immediate by default, schedulable for later.** Running the command directly launches the harness and injects the prompt right away. Delaying it is done with the existing `schedule` command wrapping the same command string — the entry-point is command grammar only, no new dialog or UI. The intended forms are immediate (now) and one-shot at a future time/date (`at`/`on`).
- **Injection mechanism.** After the harness tab is created, author a single one-shot schedule entry on that new tab — `{ id: 'run-1', command: <prompt>, spec: 'once', nextRun: now, recurring: false }` — exactly the shape a profile `run` line produces in `buildHarnessSchedule`. The existing 1-second scheduler tick types it into the harness PTY once the harness is `running` and drops it after; if the harness is not yet running it stays due and retries on later ticks, and if the tab never opens or exits it is simply never delivered (standard harness-tab schedule behavior).
- **Prompt submission.** The prompt is delivered like any harness-tab schedule firing: the text is written to the PTY followed by a separate `\r`, so it is submitted (the harness starts working), reusing `ScheduleManager.fire`'s harness path.
- **Scheduled-marker safety.** When a scheduled command fires into an agent tab the scheduler appends ` ## scheduled ##`; this is stripped as a comment by `stripComments` before dispatch, so it never becomes part of the injected prompt. Consequence, accepted: a literal `##` inside a prompt is treated as a comment (existing comment-syntax behavior).

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Harness command parser | `parseHarnessCommand` in `src/harness/index.ts:38` | Add the `with <prompt>` split before token parsing; extend `HarnessParsed` with an optional prompt |
| Harness launch path | `HarnessManager.run`/`open`/`spawnTab` in `src/harness/manager.ts:59`,`:108`,`:142` | Thread the prompt through `run` → `open`; author the one-shot after `spawnTab` using the resolved unique `label` |
| Run-line → one-shot injection | `buildHarnessSchedule` in `src/profile/harness-schedule.ts:21` (the `run-${i}` one-shots) | The exact ScheduleEntry shape and semantics to author for the prompt; factor a tiny shared helper if it avoids duplicating the literal |
| Scheduler firing into a harness PTY | `ScheduleManager.fire` in `src/schedule/manager.ts:86` (retry-until-running, text then `\r`) | Delivers the injected prompt; no new timing code |
| Per-tab schedule setter | `ScheduleManager.set` in `src/schedule/manager.ts:35` | Attach the one-shot to the new harness tab's label |
| Scheduling the whole command | `schedule` command + `parseScheduleCommand` (`src/schedule/index.ts`), spec `product/specs/scheduling.md` | Delaying the launch is the existing `schedule NAME at TIME <command>` path, unchanged |
| Comment/marker stripping | `stripComments` in `src/tab/utils.ts:4`, applied via `recordHistory` in `src/tab/history.ts` | Already removes the scheduler's ` ## scheduled ##` suffix before the harness command runs |

## Proposed changes

**Parser (`src/harness/index.ts:38` `parseHarnessCommand`).** Extend it to recognize a trailing `with` clause. **Split the clause off first, before any option parsing.** After stripping the leading `harness` (the existing `rest` at `src/harness/index.ts:39`), locate the first standalone `with` token — the first whitespace-delimited token equal to `with`, case-insensitive; a word-boundary match (`/\bwith\b/i`) is fine since it will not match `within` (no boundary between `with` and `in`). Everything from that token to end of line is the prompt: take the remainder of the original `rest` string after the token, trimmed, so internal spaces are preserved verbatim (do not re-split and re-join the prompt, which would normalize whitespace). Parse only the left portion (the tokens before `with`) through the existing `-w`/`--offline`/`-y`/`--model`/`--effort`/`as` logic — this ordering is required so a prompt that itself contains `-w`, `as`, or `--model` (e.g. `harness claude with add a -w flag`) is never scanned as options. An empty prompt (a `with` with nothing after it) is a usage error, returned in the `error` shape. Add an optional `prompt` field to the success member of the `HarnessParsed` union (`src/harness/index.ts:12`) and document the new clause in the function's doc comment (`src/harness/index.ts:26`–`:37`). The `capture` form (`src/harness/index.ts:42`) is unaffected — it has no `with` clause.

**Launch path (`src/harness/manager.ts`).** Pass the parsed `prompt` from `run` (`src/harness/manager.ts:66`, the `return this.open(...)` call) into `open` by adding an optional trailing `prompt?: string` parameter to `open` (`src/harness/manager.ts:108`). `open` is called only from `run` (verified — the sole call site), so `openFromProfile` and its own `run`/`schedule` authoring at `src/profile/agent-opener.ts` are untouched. Inside `open`, after the existing `spawnTab(...)` call (`src/harness/manager.ts:121`) and before `return undefined` (`:122`), when `prompt` is set, call `this.managers.schedule.set(label, [entry])` where `entry` is a one-shot in the exact profile-`run` shape — `{ id: 'run-1', command: prompt, spec: 'once', nextRun: Date.now(), recurring: false }` (identical to `src/profile/harness-schedule.ts:23`). Placing it after `spawnTab` means the `parseDir` failure early-return (`src/harness/manager.ts:116`) naturally drops the prompt when no tab is created. Setting the entry before the harness PTY is ready is correct: the entry's `nextRun` is now, and `ScheduleManager.fire` (`src/schedule/manager.ts:86`–`:88`) holds delivery until `tab.harness.status === 'running'` and a `ptyId` exists, retrying each tick. If this ~4-line addition pushes `src/harness/manager.ts` over the 200-line counted limit (`check-diff` will report it), extract the one-shot construction into a tiny helper shared with `buildHarnessSchedule` (`src/profile/harness-schedule.ts:22`–`:24`) rather than trimming code.

**No new protocol or web changes.** The clause is command-text only; it flows through the existing `command` RPC and the existing harness-launch and schedule-firing paths. The scheduling of it is the existing `schedule` command.

**Spec.** Update `product/specs/harness.md` to document the `with <prompt>` clause (placement after options, free-text-to-end-of-line, empty-prompt error, immediate injection via a one-shot run entry). Add a note to `product/specs/scheduling.md` that a scheduled `harness … with …` command creates a fresh harness and injects its prompt at fire time, cross-referencing the harness spec and the existing profile `run` mechanism.

## Tests

- `src/harness/index.test.ts`: `parseHarnessCommand` extracts the prompt after `with` preserving internal spaces; combines with `as`/`--model`/`-w` before the clause; returns a usage error for `with` with no following text; a command without `with` still parses as today; `harness capture` is unaffected.
- `src/harness/manager.test.ts`: launching with a prompt creates the harness tab and sets exactly one one-shot schedule entry (`spec: 'once'`, `recurring: false`) on the new tab's label whose command is the prompt; launching without a prompt sets none; a de-duplicated label attaches the one-shot to the resolved label.
- Schedule integration (mirroring existing scheduler tests): a due entry whose command is `harness … with …` creates a harness and, once the harness reports running, the prompt is delivered to the PTY and the one-shot drops; while the harness is not yet running the prompt stays pending; the ` ## scheduled ##` marker never appears in the delivered prompt.

## Out of scope

- Recurring scheduled harness creation (`every N`, `every day at`) — the intended forms are immediate and one-shot at a future time; a recurring form that spawns a fresh harness each firing is not a design goal here.
- Task-picker / `ai/tasks` integration — the prompt is free text only; injecting a chosen `execute ./ai/tasks/<path>` task is a separate follow-up.
- Any dialog or UI entry point (e.g. a field in the harness or scheduling dialog) — this feature is command-grammar only.
- Changing how the harness itself is launched, sandboxed, or how existing profile `run`/`schedule` authoring works.
- Injecting multiple prompts, or awaiting the harness's response before the entry drops.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: run `harness claude with say hello and stop` and confirm a new Claude harness tab opens and, once it is ready, receives and submits "say hello and stop" as its first input; run `harness claude with` alone and confirm the usage error with no tab created; run `schedule demo at <a minute from now> harness claude with list the files here` and confirm that at the scheduled time a fresh harness opens and is fed "list the files here" (with no ` ## scheduled ##` text appearing in the prompt); start a scheduled launch and confirm that if the harness is briefly not ready the prompt is delivered on a later tick rather than lost.
