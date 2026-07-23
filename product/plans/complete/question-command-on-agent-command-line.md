# Question Command on the Agent Command Line

**Complexity: 3/10** — one new self-contained command module reusing existing pure parsing/registry code, registered in the existing command array, plus tests and a spec addition. No new state, no protocol change, no UI change.

## Goal

Let a human type `question ask "<question>"` or `question approve "<question>" <option> [<option> …]` directly into an agent tab's command line, opening the same pending-question panel an ACP agent's own `question` command opens today. Currently the `question` syntax is recognized only inside the ACP tool loop (`src/acp/manager.ts:108-115`, matched against the agent's own reply text via `extractQuestionCommand`); typed into the command line it is not recognized as a command at all and is sent to the agent as a plain prompt (`src/resolve.ts:16-45` has no `question` entry in the `commands` array it walks).

## Approach

Add `src/commands/question.ts` as a new self-contained `Command` (architecture principle 5), registered in `src/commands/index.ts` alongside the other 30 commands. It reuses `runQuestionCommand` from `src/question-command.ts` — the same pure parser/dispatcher the ACP loop already calls — rather than duplicating parsing logic (principle 4: parse pure, execute effectful; principle 5: one command, one definition).

`runQuestionCommand` returns `string | Promise<string>`: a `string` only for a malformed command's usage text, and always a `Promise<string>` for a valid one, since `Questions.register` (`src/questions.ts:24`) is asynchronous — it resolves only once the human answers or cancels. `managers.tab.append`'s `LogEntry.output` is a plain `string` (`src/types.ts:12`) and is never awaited by the tab manager, so the command cannot pass the raw result straight into `append` the way the synchronous `db` command does. Instead it mirrors the existing async-command pattern used by `browser.runInteractive` (`src/browser/tab.ts:93-102`): call `managers.tab.startRunning` immediately to show the input line and mark the tab busy/running, then resolve the promise and call `managers.tab.finishRunning` with the answer.

## Implementation steps

1. Add `src/commands/question.ts`:
   - `match`: `/^question\s+(ask|approve)\b/i`, matching the same command-name test `extractQuestionCommand` uses.
   - `run`: call `runQuestionCommand(command, tab.label, managers.questions)`. If the result is a `string` (malformed usage), `managers.tab.append` it directly, mirroring `notify.ts`'s usage-error path. Otherwise call `managers.tab.startRunning(tab.label, command)` and attach a `.then` that calls `managers.tab.finishRunning(tab.label, answer)`.
2. Register the new command in `src/commands/index.ts`: import `question` from `./question.js` and add it to the `commands` array.
3. Run `./scripts/run.mjs check-diff` and fix any lint/typecheck issues.

## Tests

New `src/commands/question.test.ts`, modeled on `src/commands/notify.test.ts` (real `TabManager` instance plus a real `Questions` instance, not mocks):

- `command.name` is `'question'`.
- `match` accepts `question ask "..."` and `question approve "..." A B` (case-insensitively) and rejects unrelated input (e.g. `questionnaire`, `clear`).
- Typing a valid `question ask "..."` marks the tab running/busy and registers a pending question in `Questions`; answering it resolves the entry and appends the answer as the command's output.
- Typing a valid `question approve "..." A B` behaves the same, validated against the supplied options.
- Typing a malformed command (e.g. `question ask` with no quoted question) appends the usage text directly without registering a question or marking the tab busy.

## Spec

Update `product/specs/agent-questions.md`'s "Commands" section to note the human can also type `question ask`/`question approve` directly into the owning tab's command line, with the same syntax and panel behavior as when an ACP agent issues it.

## Out of scope

- Any change to the ACP tool-loop path, the pending-question panel UI, notifications, or the `Questions` registry itself — all unchanged and reused as-is.
- Tab completion for `question`'s arguments (no existing command completes free-text/quoted arguments this way).
- `help.md` — it does not document per-command syntax at this level of detail (verify during Step 6; no change expected).
