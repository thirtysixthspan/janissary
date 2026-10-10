# Send a rail click down the same path a typed line takes

**Complexity: 5/10** — one submission path shared by two surfaces, the server handing back what it already computed, and client tests for the two outcomes the rail was silent about.

The command rail's `onOpen` in `web/src/plugins/launcher/LauncherTab.tsx` fires a `run-command` intent at the server and throws the answer away: `void capabilities.intent(...).catch(() => {})`. Two things are wrong with that, and they compound.

First, it skips the application's interception. `tasks` and `hist` — the launcher's own default rows — are overlay words the *client* classifies: `classifyCommandBarSubmit` answers them by opening the task picker and the history list, and `src/commands/tasks.ts` and `src/commands/hist.ts` deliberately do nothing on the server. A rail click therefore reaches a server no-op, so the launcher's two default buttons do nothing at all, while the same two words typed into the bar directly below them work.

Second, it discards the result. `run-command` in `src/plugins/launcher/activate.ts` already resolves the id back to the line and calls `dispatchLineWithOutput`, which answers `{ dispatched, output }` — and then `void`s it and returns `null`. So a configured command whose line nothing claims, and one that fails, are as silent as one that succeeded. The typed bar right below shows all three.

## Goal

A rail click takes the same route a typed line takes: the application answers it first, and otherwise the row is dispatched and the rail shows what came back. The server still validates the id, and hands back the dispatch it already performed.

## Approach

1. **`src/plugins/launcher/activate.ts`** returns what it already computes. The `run-command` and `configure` intents `return capabilities.dispatchLineWithOutput(...)` instead of `void`-ing it and answering `null`. An unknown id still answers `null`, which is the server's own validation and stays.
2. **`web/src/plugins/launcher/useLauncherSubmit.ts`** becomes the one submission path for both surfaces. It exposes `line` for a typed submission and `command` for a rail row, and both converge on the same report: the application's interception first, then the dispatch, then the reply text or the line saying nothing claimed it.
3. **`web/src/plugins/launcher/LauncherTab.tsx`** routes the rail's `onOpen` through `submit.command`, and the Configure button reports a failure into the same reply area rather than swallowing it.
4. The rail still sends the *id*, not the command line, so the host's own validation of `launcher.json` remains the thing that decides what may run.

### Rejected alternatives

- Making the client dispatch the command line itself. It would bypass the server's read of the file, so a row a second `launcher` had invalidated could still run, and the visible rail would no longer be the authority on what runs.
- Adding a second intent for rail rows. The row is the same event as a typed line — a command the user asked for — and two intents would drift on the reply shape.
- Showing a reply only for typed lines. That is the current behaviour and the reason a failing rail row is silent.

## Implementation steps

1. Return the dispatch result from the `run-command` and `configure` intents.
2. Reshape `useLauncherSubmit` into `line` and `command` over one reporter.
3. Route the rail and the Configure button through it.
4. Add the client tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: a rail row whose command the application intercepts calls the interception and sends no intent at all — `tasks` and `hist`, the launcher's own defaults.
- A rail row whose command nothing claims shows the same "no application command matches" line the typed bar shows.
- A rail row whose command fails shows its output.
- A configured row still sends its id rather than its line, so the host's validation is what decides what runs.
- The typed bar's existing behaviour is unchanged, including that a `coreResponse` reply is not repeated in the rail.

## Spec updates

- `product/specs/launcher.md`: the command rail section says a click runs the command exactly as typing it would — including a command the application answers itself — and that the answer appears where a typed line's does.

## Out of scope

- The tab list's two-click confirmation, which is its own recorded entry.
- What `tasks` and `hist` do once opened. They are the application's own pickers and the rail does not implement either.
