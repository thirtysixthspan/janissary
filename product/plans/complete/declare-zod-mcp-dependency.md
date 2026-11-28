# build(deps): declare zod as a direct dependency for the MCP tool registry

**Complexity: 2/10** — 2 manifest lines across 2 files, 8 requirements, no test scenarios (p=3.84)

## Goal

The MCP tool registry builds the `question` tool's input schema with `z` from `zod`, but `package.json` never lists `zod`. The import resolves today only because npm hoists the copy that `@modelcontextprotocol/server` and `@modelcontextprotocol/core` depend on into the top-level `node_modules/zod`. An install layout that nests that copy instead, such as a later dependency that needs a different zod major, would break the import when the MCP manager loads, and that stops the whole app from starting rather than only the MCP server. This plan declares `zod` in `dependencies` at the exact version already locked, so the import rests on a declared dependency and nothing else in the installed tree moves.

## Requirements

1. `package.json` lists `zod` under `dependencies`, per the issue "Declare the zod package the MCP tool registry imports, instead of relying on the copy the MCP SDK happens to hoist."
2. The `zod` entry is pinned to exactly `4.6.7`, per the proposal "add `zod` to `dependencies` in `package.json` at exactly the locked 4.6.7, matching how the two MCP packages are pinned".
3. The root package in `package-lock.json` lists `zod` at `4.6.7` among its dependencies, per the proposal "refresh `package-lock.json` so its root package lists the dependency".
4. No resolved version in `package-lock.json` changes, per the proposal "without moving any resolved version".
5. The lockfile holds no second, nested copy of `zod`, per the proposal risk "a mismatch would show as a second nested copy in the lockfile rather than a startup failure".
6. `src/mcp/tools.ts` is left unchanged, per the proposal "Do not change `src/mcp/tools.ts`."
7. `npm run knip` does not report `zod` as an unlisted or unused dependency, per the proposal "confirm with `npm run knip` that `zod` is no longer reported as unlisted".
8. The `zod@4.6.7` target passes the supply-chain gate before either manifest is touched, per the proposal "Run `$janissary/scripts/run.mjs check-malicious-package zod@4.6.7` first and stop on a blocked or quarantined result."

## Design decisions

- Pin exactly `4.6.7` rather than a caret range. It is the version npm has already hoisted, it satisfies every range in the tree that names zod (Assumption 3), and the two MCP packages beside it are pinned exactly too (Assumption 2).
- Refresh the lockfile with `npm install --ignore-scripts` after editing `package.json`, rather than hand-editing `package-lock.json`. npm keeps the already-locked `4.6.7` because it satisfies the new exact spec, and it writes the root package's dependency list itself. `--ignore-scripts` follows the workspace rule in `ai/tasks/workspace/prepare-workspace.md` (Assumption 5).
- No spec change. The fix changes how a dependency is declared, not anything Janissary does, and `product/specs/` describes user-visible behavior with no file paths or implementation details; no spec covers dependency declarations (Assumption 6).
- No new tests. The change introduces no code and no behavior, and the existing MCP tests already exercise the schema built from the import (Preserved behavior 1 and 2).
- The entry says `npm run knip` "already reports it as an unlisted dependency". A run on this branch before the change doesn't list `zod` under Unlisted dependencies (Assumption 4). The knip check therefore confirms that declaring `zod` adds no new knip finding, such as an unused dependency, rather than that it clears one.

## Preserved behavior

1. The local handler registers the `question` tool with the schema from `src/mcp/tools.ts` and returns a non-error text result for a valid question. Declaring the dependency must not change how `zod` resolves for that import, so the registration must not fail and the result must not become an error. Pinned by `registers the question tool and returns a non-error text result for a valid question` in `src/mcp/handler.test.ts`.
2. A `tools/list` call against the running manager lists exactly the `question` tool, with its schema converted by the SDK. The change must not add, drop or alter a listed tool. Pinned by `serves a tools/list call that returns exactly question` in `src/mcp/manager.test.ts`.

## Assumptions

1. The registry imports zod directly: `src/mcp/tools.ts:1` "`import { z } from 'zod';`", and it builds the schema with it at `src/mcp/tools.ts:11` "`export const questionInputSchema = z.object({`".
2. `package.json` has no `zod` entry, and pins the MCP packages exactly: `package.json:110` "`\"@modelcontextprotocol/node\": \"2.1.2\",`" and `package.json:111` "`\"@modelcontextprotocol/server\": \"2.4.0\",`".
3. The hoisted copy is 4.6.7 and every range on it accepts that version: `package-lock.json:9782` "`\"version\": \"4.6.7\",`" under `node_modules/zod`; `package-lock.json:1657` and `package-lock.json:1751` "`\"zod\": \"^4.2.0\"`" for `@modelcontextprotocol/core` and `@modelcontextprotocol/server`; `package-lock.json:91` "`\"zod\": \"4.6.7\"`" for `@agentclientprotocol/claude-agent-acp`; and `package-lock.json:6997` "`\"zod\": \"^4.4.3\"`" for `knip`.
4. knip on this branch, before the change, lists only `lightningcss` under Unlisted dependencies, so `zod` isn't currently reported; the run's output "`Unlisted dependencies (1)`" followed by "`lightningcss  web/src/stylesheets-minify.test.ts:4:27`".
5. Workspace installs skip lifecycle scripts: `ai/tasks/workspace/prepare-workspace.md:30` "Then run `npm install --ignore-scripts`".
6. Specs describe behavior without implementation detail: `ai/tasks/feature/work-pull-request-issue.md:109` "prose describing user-visible behavior only — no code, no implementation details, no file paths."
7. The supply-chain gate passes the target: `$janissary/scripts/run.mjs check-malicious-package zod@4.6.7` printed "`OK          zod@4.6.7`" and exited 0.

## Existing functionality

1. The supply-chain gate for package update targets: `AGENTS.md:113` "`$janissary/scripts/run.mjs check-malicious-package <pkg>@<version> ...`".
2. npm's lockfile refresh, which writes the root package's dependency list from `package.json`: `package-lock.json:12` "`\"dependencies\": {`" under the `""` package.

## Implementation steps

1. Confirm the gate result for `zod@4.6.7` (already run: exit 0, not blocked or quarantined). Add `"zod": "4.6.7"` to `dependencies` in `package.json`, in its alphabetical place after `ws`. Run `npm install --ignore-scripts` to refresh `package-lock.json`. Check the lockfile diff: the only change is the added `"zod": "4.6.7"` line in the root package's `dependencies`, with no version, `resolved` or `integrity` value moved and no `node_modules/*/node_modules/zod` entry added. Run `npm run knip` and confirm `zod` appears under neither Unlisted nor Unused dependencies. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Promote this plan to `product/plans/complete/` and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entry unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. Nothing the user sees or operates changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named under Preserved behavior already exercise the schema built from the `zod` import and must keep passing unchanged. Requirements 3 to 5 are confirmed by reading the lockfile diff, and Requirement 7 by the knip run, as described in Verification.

## Out of scope

- Any change to `src/mcp/tools.ts`, `src/mcp/handler.ts` or the tool schema.
- Upgrading or moving any other package, including the quarantined locked versions the lockfile audit reports.
- The other entry in `product/backlog/pull-request.md`, which shares the loopback MCP listener.
- `product/specs/`, `help/`, `documentation/user-documentation/` and `documentation/developer-documentation/`.
- The PR description and title.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read `git diff package.json package-lock.json`. `package.json` should gain exactly one line, `"zod": "4.6.7"`, under `dependencies`. `package-lock.json` should gain exactly the same line under the root `""` package's `dependencies`, and nothing else. A changed `version`, `resolved` or `integrity` value anywhere, or a new `node_modules/<pkg>/node_modules/zod` entry, means the pin pulled a second copy or moved the tree and the change is wrong. Run `npm run knip` and confirm `zod` appears under neither Unlisted dependencies nor Unused dependencies. Finally start the app with `node bin/janus.mjs --no-open <scratch-dir>` and run `mcp` in its first tab: it should print `status: running` with a `url: http://127.0.0.1:<port>/mcp` line and `tools: question`, rather than the app failing to start, which shows the MCP manager loaded the registry with the declared `zod`.
