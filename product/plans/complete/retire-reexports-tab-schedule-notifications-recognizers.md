# Retire the compatibility re-exports in the tab, schedule, notifications, and recognizer modules

**Complexity: 4/10** — import-path rewriting across roughly twenty server files and their tests, plus deleting one pure barrel (`src/recognizers/index.ts`). No behavior, wire, client, or command change; the typechecker verifies every rewritten import.

Each time a server module was split to stay under the 200-line limit, the moved symbols were re-exported from the old home so existing importers kept compiling. `ai/guidelines/imports-and-barrel-files.md` says every symbol is imported from the module that defines it, but nothing enforces that, so the re-exports stayed and callers kept reaching through them. In this first group:

- `src/tab/index.ts` re-exports `expandTabs`, `wordWrap`, and `flattenBuffer` from `./formatting.js`, `distinctColor` and `dotColors` from `./colors.js`, and seven helpers from `./utils.js`, and its own siblings (`src/tab/creators.ts`, `root.ts`, `view.ts`, `rehydrate.ts`, `operations.ts`, `history.ts`) import them back through it — the shape in which an ordinary new import becomes an initialization-order cycle.
- `expandTabs` travels two hops (`src/tab/formatting.ts` → `src/tab/formatting-handlers.ts` → `src/tab/expand-tabs.ts`), and `wordWrap` passes through `src/tab/formatting.ts` from `src/word-wrapping.ts`.
- `src/schedule/index.ts` re-exports `SCHEDULE_USAGE` and the `parsing`, `time`, and `display` helpers.
- `src/notifications/index.ts` re-exports `formatTimestamp`, `provenanceTimestamp`, and `notificationText` from `./format.js`.
- `src/recognizers/index.ts` is a pure barrel over `./analyze.js` and `./types.js`, and `src/recognizers/analyze.ts` re-exports `routeChoices` and `toPrefixedCommand` from `./route-choices.js`, so those two travel two hops.

## Goal

No file under `src/tab/`, `src/schedule/`, `src/notifications/`, or `src/recognizers/` carries an `export { … } from` line, every importer names the file that defines the symbol, and `src/recognizers/index.ts` no longer exists.

## Approach

For each re-exported symbol, rewrite its importers (production and tests) to the defining file with a `.js` extension, then delete the re-export line. Where the old home also uses the symbol itself, keep a plain `import`:

- `src/tab/formatting-handlers.ts` keeps its `import { expandTabs } from './expand-tabs.js'`.
- `src/schedule/index.ts` keeps its `import { SCHEDULE_USAGE } from './usage.js'`.
- `src/notifications/index.ts` keeps its `import { notificationText, provenanceTimestamp } from './format.js'`.

Symbols actually defined in `src/tab/index.ts` (`makeTab` and the other `make*Tab` factories), `src/schedule/index.ts` (`parseScheduleCommand`), and `src/notifications/index.ts` (`notify`, the event lists, `shouldNotify`) keep being imported from there. `src/recognizers/index.ts` has nothing of its own, so it is deleted once its three importers (`src/command/manager.ts`, `src/command/router.ts`, `src/route-choice.ts`) point at `route-choices.js` and `analyze.js`.

Rejected alternative: add the `no-restricted-syntax` lint rule now. About a dozen other server modules still carry re-exports, so the rule would either fail or need a long exemption list; it belongs to the increment that clears the rest.

## Implementation steps

1. Tab group: rewrite importers of the `src/tab/index.ts` re-exports to `./colors.js`, `./utils.js`, `./formatting.js`, `./expand-tabs.js`, and `../word-wrapping.js` — `src/buffer.ts`, `src/ssh-manager.ts`, `src/harness/manager.ts`, `src/sessions/attach.ts`, `src/sessions/restore-tabs.ts`, `src/profile/place-agent.ts`, `src/profile/entry-openers.ts`, `src/profile/editors.ts`, `src/profile/agent-opener.ts`, the `src/tab/*.ts` siblings, and `src/tab/index.test.ts`. Delete the three re-export lines from `src/tab/index.ts`, the two from `src/tab/formatting.ts`, and the one from `src/tab/formatting-handlers.ts`.
2. Schedule: point `src/schedule/views.ts`, `src/schedule/manager.ts`, `src/commands/schedule.ts`, and `src/schedule/index.test.ts` at `./display.js`, `./time.js`, and `./parsing.js`; delete the four re-export lines.
3. Notifications: point `src/notifications/index.test.ts` at `./format.js` for `notificationText`; delete the re-export line and the comment that justifies it.
4. Recognizers: point the three importers at `analyze.js` and `route-choices.js`, delete the re-export from `src/recognizers/analyze.ts` (its test imports the two functions from `./route-choices.js`), and delete `src/recognizers/index.ts`.
5. Run `./scripts/run.mjs check-diff` after each group.
6. Rewrite the backlog entry to cover the next increment: the remaining re-export sites in `src/` and the lint rule that enforces the guideline.

## Tests

No behavior changes, so the existing suites are the check: a missed importer of a deleted re-export fails to compile, and each rewritten test must pass unchanged apart from its import lines. `src/tab/index.test.ts`, `src/schedule/index.test.ts`, `src/notifications/index.test.ts`, and `src/recognizers/analyze.test.ts` import the moved symbols from their defining files.

## Spec

None — a refactor with no user-visible change.

## Out of scope

- Re-exports elsewhere in `src/` (`client-message.ts`, `database/index.ts`, the `monitor/` modules, `file-navigator/index.ts`, `completion/handlers.ts`, `controller/file/navigator.ts`, `cli-args.ts`, `harness/`, `personas.ts`, and others), which the rewritten backlog entry carries as the next increment.
- `src/plugins/api.ts` (the published plugin contract) and `src/plugins/fixture-v1/activate.ts`, which the guideline allows.
- The `no-restricted-syntax` rule that would enforce the guideline.
