# feat: add the mcp status command

**Complexity: 3/10** — ~50 added lines, 1 edited file, 4 requirements (p=4.39)

## Goal

Add an `mcp` command that reports the local server's state from `McpManager.status()` as a plain key/value block, without ever printing the token. This is the user-facing way to see whether the server is running and at which URL, and it consumes only the status API delivered by the manager subplan.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-5-local-server-manager.md`.

## Requirements

1. An `mcp` command reports the server's state — user scope extra: "`mcp` status command".
2. While the server runs, `mcp` prints the key/value block `status: running`, `url: http://127.0.0.1:<port>/mcp`, `port: <port>`, `tools: question` — user answer: "Key/value block".
3. While the server is not running, `mcp` prints `status: not running` and `reason: <reason>` only — user answer: "status + reason".
4. The `mcp` command never prints the token — user scope extra: "without printing the token".

## Design decisions

- The command follows the one-command-one-definition shape of `src/commands/question.ts`: a `Command` with `name`, `match`, `samples` and `run`, registered in `src/commands/index.ts`. It reads only `managers.mcp.status()` and never `localLaunch()`, which is the API that carries the token.
- Output is written through the command's normal append-output path so it appears in the transcript like any other command result.
- `help/mcp.md` is added and `mcp` is listed in `help/commands.md` in alphabetical order, which `src/commands.test.ts` enforces; `mcp` sorts before `models`.

## Preserved behavior

None found.

## Assumptions

1. The manager exposes `status()` with running/url/port or not-running/reason — `src/mcp/manager.ts` (added by `janissary-mcp-server-5-local-server-manager.md`).
2. A command is one definition with a single execution path — `src/commands/question.ts` `export const command: Command = {`.
3. The command registry is the list of core commands — `src/commands/index.ts:98` `export const commands: Command[] =`.
4. The help table is alphabetized and enforced by a test — `ai/guidelines/documentation.md` § Help Command Table, `src/commands.test.ts`.

## Existing functionality

1. Command module shape and help page — `src/commands/question.ts` `export const command: Command = {`, `help/question.md`.
2. Command registry — `src/commands/index.ts:40` `import { command as question } from './question.js';`.
3. Command output appended to the transcript — `src/commands/question.ts:10` `appendCommandOutput(managers, label, { input: command_, output: result }, invocation);`.
4. The manager status API — `src/mcp/manager.ts` `status()`.

## Implementation steps

1. Create `src/commands/mcp.ts` as a `Command` following `src/commands/question.ts`: `name: 'mcp'`, a `match` for the bare `mcp` token, a short sample, and a `run` that calls `managers.mcp.status()` and appends the rendered block through `appendCommandOutput`. Render the four running lines or the two not-running lines exactly as specified, and never read or print the token. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Register the command in `src/commands/index.ts` beside `question` (`src/commands/index.ts:88`). Add `help/mcp.md` with the two output forms and insert the `mcp` row into `help/commands.md` before `models`, keeping the table alphabetical. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. No new visual component: the command renders its key/value block in the ordinary transcript output. An illustrative running block is:

```
status: running
url: http://127.0.0.1:43127/mcp
port: 43127
tools: question
```

## Tests

- `src/commands/mcp.test.ts`: the running block's four lines and the not-running block's two lines, with the token absent from both, and the command's `match` accepting only bare `mcp` (requirements 1–4). Keep `src/commands.test.ts` passing with the new alphabetized `mcp` row.

## Out of scope

- Starting or stopping the server from the command.
- Printing the token or the state file path.
- Adding an `mcp` subcommand grammar.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then start the app and type `mcp`: expect `status: running`, a `url:` line, `port:` and `tools: question`, with no token anywhere. A failure is a two-line `status: not running` block while the server is up, or any token-like value in the output.
