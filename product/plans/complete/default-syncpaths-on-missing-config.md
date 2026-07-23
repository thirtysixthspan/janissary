# Default syncPaths when missing from config

**Complexity: 2/10** — one literal value change plus a test.

## Goal

`syncPaths` currently defaults to an empty list (`src/config.ts:31`, `DEFAULT_CONFIG.syncPaths: []`), used both when `.janissary/config.json` doesn't exist yet and when an existing config file is missing the `syncPaths` key. After this fix, that default becomes `["product/backlog/", "product/plans/"]` — the two directories most projects want synced out of the box (backlog and plans, now matched recursively via [[sync-paths-prefix-and-wildcard-matching]]'s trailing-slash directory-prefix support).

## Approach

`loadConfig` (`src/config.ts:37-58`) already applies `DEFAULT_CONFIG` for any key missing from the file, via `config = { ...DEFAULT_CONFIG, ...parsed }` — the same pattern every other setting (`syntaxTheme`, `theme`, `notifications`, etc.) relies on for its default. No new branching logic is needed; changing the `DEFAULT_CONFIG.syncPaths` literal is sufficient and covers both cases uniformly:

- No `config.json` at all → the fresh file is written from `DEFAULT_CONFIG`, so it's created with the new default.
- `config.json` exists but omits `syncPaths` → the spread fills in the new default in memory (file on disk is left untouched, same as every other omitted key).

## Implementation steps

1. `src/config.ts`: add `export const DEFAULT_SYNC_PATHS = ['product/backlog/', 'product/plans/'];` near the other `DEFAULT_*` exports, and set `syncPaths: DEFAULT_SYNC_PATHS` in `DEFAULT_CONFIG`.
2. Run `./scripts/run.mjs check-diff`.

## Tests

`src/config.test.ts`:

- Update `'defaults syncPaths to an empty list'` (line 123-126) to `'defaults syncPaths to product/backlog/ and product/plans/'`, asserting `config.syncPaths` equals `['product/backlog/', 'product/plans/']`.
- Add a test that an existing `config.json` missing the `syncPaths` key (but present with other keys) still gets the new default in memory — mirrors the existing "falls back to defaults for missing fields in existing config" test at line 61-68.

## Out of scope

- Persisting the backfilled default into an existing `config.json` that's missing the key — no other setting does this (all defaults are in-memory-only fill-ins per the existing spread pattern), so adding disk-persistence here would be an inconsistent, unrequested behavior change.
