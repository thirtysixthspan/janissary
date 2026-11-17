# Web fetch 1 — rename `src/web-search/` to `src/web/`

**Complexity: 6/10** — ~50 added lines across 21 edited production files (every moved module's relative imports plus ten outside importers), 7 requirements (p=5.76)

Run order: 1 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (section "Rename `src/web-search/` to `src/web/`", the "Code home" decision, and step 1 of "Order of work"). Depends on no earlier subplan. Every later subplan builds on the layout this one creates.

`web fetch` and `web search` will share one feature directory: one provider framework serving both subcommands, a search core, and a fetch core. Today everything lives in `src/web-search/`. This plan moves that directory to the `src/web/` layout the source plan names under "Code home", renames the API-version constant, and updates every importer, with no behavior change. No fetch code is added here.

## Design decisions

- **Layout (source plan, Code home).** `src/web/providers/` holds the provider contract, the registry, the catalog, the shared HTTP helper and JSON decoder, the Tavily and TinyFish modules, the failure-line formatter, and the frozen fixture. `src/web/search/` holds the search parser, the search core, the search rendering, and the search tab adapter. `src/web/fetch/` is created by later subplans; this plan creates no empty `fetch/` directory.
- **File moves.** `src/web-search/contract.ts`, `registry.ts`, and `failure-lines.ts` move to `src/web/providers/`. `src/web-search/providers/catalog.ts`, `decode.ts`, `http.ts`, `tavily.ts`, and `tinyfish.ts` move to `src/web/providers/`. `src/web-search/fixture-v1/` (`manifest.ts`, `provider.ts`, `compatibility.test.ts`) moves to `src/web/providers/fixture-v1/`. `src/web-search/command.ts`, `search.ts`, `render.ts`, and `tab-search.ts` move to `src/web/search/`. Every colocated `*.test.ts` moves with its module. No file name clashes inside `src/web/providers/`. Use `git mv` so history follows.
- **The shared `web` line predicate gets a neutral home.** `isWebCommandLine` (today `src/web-search/command.ts:128`, `export function isWebCommandLine(line: string): boolean`) is not search-specific: the `web` command, the ACP tool table, the ACP run path, the agent command gate, and the far-side ACP loop all use it to claim every `web …` line. Move it, body unchanged, to a new `src/web/command-line.ts` with no imports, and point all five importers there. `parseWebSearch`, `WEB_SEARCH_USAGE`, `WEB_SEARCH_PRIMER`, the range and default constants, the `WebSearchCommand` and `WebSearchDepth` types, and `isWebSearchReplyLine` stay in `src/web/search/command.ts`. Subplans 20 and 25 extend `src/web/command-line.ts`, so the file name is fixed.
- **The frozen fixture stays byte-identical.** `src/web/providers/fixture-v1/manifest.ts` and `provider.ts` import `../contract.js`, which still resolves to the contract after the move, because the contract moves into the same `providers/` parent. Do not edit either file. `compatibility.test.ts` keeps all three of its relative imports (`../contract.js`, `../registry.js`, `./manifest.js`) and changes only the constant name.
- **Constant rename (source plan).** `WEB_SEARCH_PROVIDER_API_VERSION` becomes `WEB_PROVIDER_API_VERSION`, still `1`. Rename it at its definition (`contract.ts:25`), in the header comment above it (`contract.ts:18`), at every use (`registry.ts:5` and `:145`, `providers/catalog.ts:1`, `:6`, `:13`), and in the tests (`contract.test.ts`, including its `describe` title, `registry.test.ts`, `search.test.ts`, `fixture-v1/compatibility.test.ts`). The fixture declares the literal `1`, not the constant, so it is untouched.
- **No re-exports and no shims.** Nothing is re-exported from the old path, and `src/web-search/` no longer exists after this change. `eslint.config.mjs` already fails any `export … from` outside the three allowed modules (`ai/guidelines/imports-and-barrel-files.md`).
- **Type and value names stay.** `WebSearchProviderManifest`, `WebSearchProvider`, `WebSearchCapability`, the other contract types, `webSearchProviderCatalog`, and every function name keep their names. The frozen fixture imports two of the types by name.
- **The remote operation name stays.** The `'web-search'` string in `withRemoteTabPort(…, 'web-search', …)` (`tab-search.ts:12`), `READ_OPERATIONS` (`src/remote/filesystem/operations.ts`), the `LONG_RUNNING` set (`src/file-navigator/remote/port-requests.ts`), the protocol frames, and the result decoders is a wire name, not a path. It does not change, and no remote protocol version moves.
- **One change, one checkpoint.** Typecheck and tests are red between the moves and the import fixes, so all steps below land together before running `check-diff`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Web search modules | `src/web-search/` (14 production files, 12 test files) | Moved, not rewritten |
| Production importers of the old paths | `src/commands/web.ts`, `src/completion/web.ts`, `src/acp/tool-table.ts`, `src/acp/run-prompt.ts`, `src/agent/command-tools.ts`, `src/remote/serve-acp-loop.ts`, `src/remote/filesystem/web-search-operation.ts`, `src/file-navigator/remote/port-reads.ts`, `src/file-navigator/remote/port.ts`, `src/remote/protocol-frames.ts` | Import paths updated (table below) |
| Test importers and `vi.mock` paths | `src/commands.test.ts`, `src/commands/web.test.ts`, `src/completion/web.test.ts`, `src/acp/run-prompt.test.ts`, `src/acp/tool-table.test.ts`, `src/remote/filesystem/operations.test.ts`, `src/remote/serve-acp-loop.test.ts`, `src/remote/serve-file-navigator.test.ts`, `src/remote/serve-provision.test.ts` | Import and mock paths updated (table below) |
| Developer documentation paths | `documentation/developer-documentation/web-search-providers.md` | Paths and the constant name updated |

No other tracked file names a `src/web-search/` path or the constant: `product/specs/`, `AGENTS.md`, `ai/guidelines/`, `eslint.config.mjs`, `vitest.config.ts`, `knip.json`, and the `fta/` baselines were checked. `product/plans/complete/web-search.md` cites the old paths as history and is not edited.

## Proposed changes

1. Create `src/web/providers/` and `src/web/search/` and move the files as listed above with `git mv`, tests included.

2. Fix the relative imports inside the moved files for their new location. Every relative import keeps its `.js` extension. The full set, by moved file:

   | Moved file | Import changes | Imports that stay |
   | --- | --- | --- |
   | `providers/contract.ts` | `../project/tokens.js` → `../../project/tokens.js`; `./command.js` → `../search/command.js` (`WebSearchDepth`) | none |
   | `providers/registry.ts` | `../error-text.js` → `../../error-text.js`; `../project/tokens.js` → `../../project/tokens.js` | `./contract.js`, `./failure-lines.js` |
   | `providers/catalog.ts`, `decode.ts`, `http.ts`, `tavily.ts`, `tinyfish.ts` | `../contract.js` → `./contract.js` (they were one level below the contract and are now its siblings) | `../../value-guards.js` (decode), `../../models/providers/result.js` (http), `./decode.js`, `./http.js`, and the catalog's `import('./tavily.js')` and `import('./tinyfish.js')` |
   | `providers/decode.test.ts`, `http.test.ts`, `tavily.test.ts`, `tinyfish.test.ts` | `../contract.js` → `./contract.js` | their own `./<module>.js` |
   | `providers/registry.test.ts` | `../project/tokens.js` → `../../project/tokens.js`; `./providers/catalog.js` → `./catalog.js` | `./contract.js`, `./registry.js` |
   | `providers/contract.test.ts`, `failure-lines.test.ts`, `failure-lines.ts`, `fixture-v1/*` | none | all |
   | `search/command.ts` | `../positive-integer.js` → `../../positive-integer.js` | none |
   | `search/search.ts` | `../project/tokens.js` → `../../project/tokens.js`; `./contract.js` → `../providers/contract.js`; `./failure-lines.js` → `../providers/failure-lines.js`; `./providers/catalog.js` → `../providers/catalog.js`; `./registry.js` → `../providers/registry.js` | `./command.js`, `./render.js` |
   | `search/render.ts`, `search/render.test.ts` | `./contract.js` → `../providers/contract.js` | `./render.js` |
   | `search/tab-search.ts` | `../managers.js`, `../file-read/tab-read.js`, `../file-read/remote-tab-port.js`, `../project/tokens.js`, `../notifications/index.js`, `../error-text.js` each gain one `../` | `./command.js`, `./search.js` |
   | `search/search.test.ts` | `../project/tokens.js` → `../../project/tokens.js`; `./contract.js` → `../providers/contract.js`; `./providers/catalog.js` → `../providers/catalog.js`; `./registry.js` → `../providers/registry.js` | `./command.js`, `./search.js` |
   | `search/tab-search.test.ts` | `../managers.js` → `../../managers.js`, and the three `vi.mock` paths `../file-read/remote-tab-port.js`, `../notifications/index.js`, `../project/tokens.js` each gain one `../` | `./command.js`, `./search.js`, `./tab-search.js`, and `vi.mock('./search.js')` |

   The `vi.mock` paths in `tab-search.test.ts` are the trap: TypeScript does not check a `vi.mock` string, and the verification grep for `web-search/` cannot see them, so update them by hand.

3. Create `src/web/command-line.ts` holding `isWebCommandLine`, unchanged. Remove it from `src/web/search/command.ts`. Move the `describe('isWebCommandLine', …)` block (today `command.test.ts:184`) verbatim into a new `src/web/command-line.test.ts` that imports from `./command-line.js`, and drop `isWebCommandLine` from `command.test.ts`'s import list. Every other `command.test.ts` block stays, including `isWebSearchReplyLine`.

4. Update the ten production importers and nine test files. Each symbol goes to its new defining file:

   | File | New imports |
   | --- | --- |
   | `src/commands/web.ts` (lines 3–4) | `isWebCommandLine` from `../web/command-line.js`; `searchWebInTab` from `../web/search/tab-search.js` |
   | `src/completion/web.ts` (line 5) | `webSearchProviderNames` from `../web/search/search.js` |
   | `src/acp/tool-table.ts` (line 12) | split: `isWebCommandLine` from `../web/command-line.js`; `isWebSearchReplyLine`, `WEB_SEARCH_PRIMER` from `../web/search/command.js` |
   | `src/acp/run-prompt.ts` (lines 19–20) | `isWebCommandLine` from `../web/command-line.js`; `searchWebInTab` from `../web/search/tab-search.js` |
   | `src/agent/command-tools.ts` (line 8) | `isWebCommandLine` from `../web/command-line.js` |
   | `src/remote/serve-acp-loop.ts` (lines 12–13) | split: `isWebCommandLine` from `../web/command-line.js`; `parseWebSearch` from `../web/search/command.js`; `webSearch` from `../web/search/search.js` |
   | `src/remote/filesystem/web-search-operation.ts` (lines 5–9) | the range constants and `WebSearchDepth` from `../../web/search/command.js`; `webSearch` from `../../web/search/search.js` |
   | `src/file-navigator/remote/port-reads.ts` (line 8), `port.ts` (line 25) | `WebSearchCommand` from `../../web/search/command.js` |
   | `src/remote/protocol-frames.ts` (line 12) | `WebSearchCommand` from `../web/search/command.js` |
   | `src/commands.test.ts` (line 11) | `WEB_SEARCH_USAGE` from `./web/search/command.js` |
   | `src/commands/web.test.ts` (line 7) | `vi.mock('../web/search/tab-search.js', …)` |
   | `src/completion/web.test.ts` (line 9) | `tavilyManifest`, `tinyfishManifest` from `../web/providers/catalog.js` |
   | `src/acp/run-prompt.test.ts` (lines 32, 66) | `WEB_SEARCH_PRIMER` from `../web/search/command.js`; `vi.mock('../web/search/tab-search.js', …)` |
   | `src/acp/tool-table.test.ts` (line 21) | `WEB_SEARCH_PRIMER` from `../web/search/command.js` |
   | `src/remote/filesystem/operations.test.ts` (line 12) | the range constants from `../../web/search/command.js` |
   | `src/remote/serve-acp-loop.test.ts` (lines 10–12, 38) | `parseWebSearch`, `WEB_SEARCH_USAGE`, `WebSearchCommand` from `../web/search/command.js`; `WebSearchDeps` from `../web/search/search.js`; `vi.mock('../web/search/search.js', …)` |
   | `src/remote/serve-file-navigator.test.ts` (lines 17, 29), `src/remote/serve-provision.test.ts` (lines 11, 13) | `webSearch` from `../web/search/search.js`; `vi.mock('../web/search/search.js', …)` |

   A stale mock path silently stops mocking, so grep for `web-search/` after the change and expect no hit under `src/`.

5. Rename the constant everywhere listed under Design decisions.

6. Update `documentation/developer-documentation/web-search-providers.md`: `src/web-search/contract.ts` → `src/web/providers/contract.ts` (line 7); `src/web-search/providers/catalog.ts` → `src/web/providers/catalog.ts` (lines 11 and 59); `src/web-search/providers/example.ts` → `src/web/providers/example.ts` (line 59); `src/web-search/failure-lines.ts` and `registry.ts` → `src/web/providers/…` (line 161); `src/web-search/providers/http.ts` → `src/web/providers/http.ts` (line 180); `src/web-search/fixture-v1/` and its `compatibility.test.ts` → `src/web/providers/fixture-v1/…` (line 190); and `WEB_SEARCH_PROVIDER_API_VERSION` → `WEB_PROVIDER_API_VERSION` (lines 64, 83, 190). The fixture sample's `import type { WebSearchProvider } from '../contract.js'` (line 29) is the fixture's real import and stays. Leave the prose, the file name, and the title otherwise unchanged; later subplans rewrite the parts that describe fetch.

## Tests

No new behavior, so no new scenarios. The moved suites (`src/web/providers/*.test.ts`, `src/web/providers/fixture-v1/compatibility.test.ts`, `src/web/search/*.test.ts`, `src/web/command-line.test.ts`) and every suite that imports or mocks the old paths must pass unchanged apart from their import and mock paths and the constant name. The `isWebCommandLine` accept cases (`web`, `Web search x`, `web foo`) and reject cases (`webby`, `websearch`, `file web`) keep running from their new file, and the compatibility test still pins the constant and the fixture at `1`.

## Out of scope

- Any fetch code, contract change, or new provider (subplans 2 through 12).
- Renaming the contract types, the catalog export `webSearchProviderCatalog`, or the developer doc's file name and title.
- Renaming `src/remote/filesystem/web-search-operation.ts` or the `'web-search'` remote operation; it stays the `web-search` operation.
- Any spec change: `product/specs/web-search.md` and the specs that link `[[web-search]]` name no code path.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web src/commands src/completion src/acp src/agent src/remote src/file-navigator` so every moved suite and every importer's suite runs even where `--changed` would skip it. Then confirm:

- `grep -rn "web-search/" src` finds nothing;
- `grep -rn "WEB_SEARCH_PROVIDER_API_VERSION" src documentation` finds nothing;
- `src/web-search` no longer exists (no leftover untracked file keeps the directory alive);
- `git status` shows every move as a rename, with `fixture-v1/manifest.ts` and `fixture-v1/provider.ts` as 100% renames.

In a shell tab, `web search vitest` still behaves exactly as before, and bare `web` still prints the `web search` usage line.
