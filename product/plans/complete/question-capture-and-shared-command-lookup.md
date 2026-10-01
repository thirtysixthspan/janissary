# Answer a messaged question with the human's answer, and share one command lookup

**Complexity: 3/10** — a `findCommand` beside the registry (`src/commands/index.ts`) used by both dispatchers, and a `capture` hook on `src/commands/question.ts`. No new architecture.

`CaptureManager.runCommand` (`src/capture/manager.ts`) picked a command's `capture` hook with `commands.find((c) => c.name === name)`, while `CommandManager.executeCommand` (`src/command/manager.ts`) had already moved to a match-aware lookup, with a comment explaining why first-by-name is wrong when a plugin command and a built-in share a name (`search`). And a command with no hook is answered by reading the recipient tab's last appended entry as soon as `run` returns. `question`'s `run` starts a running entry with empty output and finishes it only when the human answers, so a messaged `question ask` answered its sender with `''` at once.

## Goal

- One lookup, `findCommand(name, input)`, used by every dispatcher.
- A messaged `question ask`/`question approve` responds with the human's answer once there is one (or `Question cancelled.`), and a malformed one with its usage text at once. The recipient's transcript entry is unchanged.

## Approach

1. Move the match-aware lookup and its comment into `findCommand` in `src/commands/index.ts`; `executeCommand` and `CaptureManager.runCommand` call it.
2. In `src/commands/question.ts`, a module-level `ask(command, label, managers, reply?)` does what `run` did and additionally calls `reply` with the same text the entry ends with; `run` calls it without `reply`, `capture` with it.

## Tests

- `src/capture/manager.test.ts`: a messaged `question ask` does not answer before the human does, does not go through `executeCommand`, and answers with the human's answer once it arrives (and the entry is finished with it); a malformed messaged question answers with its usage at once.
- `src/commands.test.ts`: for every registry entry, `findCommand(entry.name, sample)` returns that entry for each of its own samples — and the registry does have shared names, so this pins the match-aware choice.
- `src/commands/question.test.ts` and `src/question-command.test.ts` keep passing.

## Out of scope

- Letting `run` return its output, which would retire the last-entry read for every command.
