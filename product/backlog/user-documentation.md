# user documentation gaps

Last run: 2026-07-23 23:56 UTC

Functional areas where user documentation lags application behavior, scored 1–10 for the size of the mismatch (10 = completely undocumented).

## candidates

* append-only-log (10/10) — The append-only transcript log has no user-documentation page and no `help.md` coverage, so 13 of 13 documentable facts are missing. Users are not told that `.janissary/log/<YYYY-MM-DD>.json` contains one JSON object per line with `timestamp`, `agent`, and `text`, that command inputs and outputs are logged separately, that messages, ACP traffic, and shell output are included, or that daily files accumulate and are never compacted or cleared. The `product/specs/append-only-log.md` claim that rotation is UTC is stale: the application uses the local calendar date and local `HH:MM:SS.mmm` time from `src/datetime.ts`, with writes implemented in `src/transcript/logger.ts` and initialization in `src/main.ts`; `src/transcript/store.ts` is the separate persisted per-tab transcript store. Fix by adding a user-facing explanation under `documentation/user-documentation/getting-started/` (and, if desired, a concise `help.md` row) while correcting the stale UTC wording in the documentation derived from `product/specs/append-only-log.md`.

## unverified

## resolved
