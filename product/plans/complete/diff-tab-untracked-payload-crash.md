# fix: the diff tab crashed the app on its first recompute with an untracked file

**Complexity: 4/10** — two defects that only appear together at runtime: a record shape the host refuses, and a fire-and-forget call whose throw escapes as an unhandled rejection. Found by driving the app in a browser, which the unit tests could not have found because their fake capabilities never apply the host's validation.

## Goal

Stop the diff tab from taking the process down when its change set holds an untracked file, and make a failure inside its own recompute land in the tab rather than in the event loop.

## What was wrong, and what changed

An end-to-end run of the tab opened it on a repository with an untracked file, and the process printed `Error: produced an invalid tab payload` from `validateTabValue` and exited, closing every tab in the application.

- **The record carried a property whose value was `undefined`.** `parseDiff`'s caller-named path override spread `oldPath: undefined` onto every record it named, and the host validates a published payload with `isJsonCompatible` — which answers false for an object property whose value is `undefined`, not merely for an absent one. The override now omits the key instead. Every untracked file's record hit this, so any tab over a repository with untracked files died on its first recompute.
- **The recompute's throw escaped.** The intent that asks for a recompute answers immediately and leaves the recompute running, so the refusal surfaced as an unhandled rejection — the one failure shape that ends the process rather than the plugin. `DiffSession` now contains everything its recompute does: the git read, the publish, and the error path all sit inside one try/catch, and a publish the host refuses is swallowed rather than rethrown, because at that point the tab is already gone as far as the application is concerned and there is nothing left to answer it with.

## Tests

- `src/plugins/diff/parse-diff.test.ts` — a record the caller named carries no `oldPath` key at all, asserting the absence rather than a value.
- `src/plugins/diff/activate.test.ts` — the payload the session publishes passes the host's own `isJsonCompatible`, imported from `src/plugins/context.ts` rather than copied, with an untracked file present; and an intent still answers `null` and settles when every publish is refused.

## Out of scope

- Making the host's validation friendlier about `undefined` properties: the rule is the contract, and a plugin-shaped payload should satisfy it.
- Recovering a tab whose payload was refused: the host has already closed it.

## Verification

`$janissary/scripts/run.mjs check-diff` after the change, plus a live run: open the diff tab on a repository with an untracked file and confirm the tab renders and survives its refresh loop, which is how the defect was found.
