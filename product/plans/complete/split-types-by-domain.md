# Split src/types.ts into per-domain type files

**Complexity: 8/10** — mechanical but broad: 18 unrelated type groups move to 11 new/existing
files across the codebase, and `src/types.ts` becomes a slim re-export barrel. Explicitly
implemented despite exceeding the task's normal 7/10 threshold, per direct instruction.

## Goal

`src/types.ts` (672 lines, `/* eslint-disable max-lines */`) holds type definitions for 18
unrelated domains, even though almost every domain already has its own folder under `src/`.
Move each domain's types to a `types.ts` colocated in its matching folder (or, for domains that
are a single top-level file rather than a folder, directly into that file), and turn
`src/types.ts` into a slim barrel that re-exports everything by name — so none of the 200+
existing `import type { ... } from '../types.js'` call sites need to change.

## Design decision

**Re-export barrel, zero caller changes.** Every current consumer imports named types from
`'./types.js'`/`'../types.js'`. Rather than rewrite every import site to point at the new
location (large, error-prone, and out of proportion to the actual problem — the types themselves,
not their consumers, are misplaced), `src/types.ts` keeps re-exporting every type by its original
name from its new home (`export type { X, Y } from './domain/types.js';`). This matches the
backlog item's own suggested design ("re-exported from a slim src/types.ts if a single
cross-domain import point is still needed").

## Mapping (type group → destination)

| Section in old `types.ts` | Destination |
|---|---|
| tab.ts (LogEntry, TerminalEntry, MessageRenderKind, BufferLine, HarnessView, ImageView, PageView, MarkdownView, EditorView, FileNavigatorRow, FileNavigatorView, TaskRow, MonitorTarget, MonitorSuggestion, Tab) | `src/tab/types.ts` (new) |
| agent-state.ts (AgentState) + commands.ts (AgentCommand — used only by `src/agent/commands.ts`) | `src/agent/types.ts` (new) |
| profiles.ts × 2 sections (ProfileHarnessEntry, ProfileEntry, ProfileTab, ProfileAgentFile, ProfileHarnessFile, ProfileMonitor, ProfileMonitorFile, ProfileFilesEntry, ProfileEditorsEntry, ProfileNotificationsEntry, ProfileSchedulesEntry, ProfileLayout, ProfileLayoutFile, ProfileFile, LoadedProfile, ProfileParsed) | `src/profile/types.ts` (new; imports `AgentState` from `../agent/types.js`) |
| schedule.ts (TimeOfDay, ScheduleEntry, ScheduleParseResult) | `src/schedule/types.ts` (new) |
| acp.ts + acp-loop.ts (PromptHandlers, AcpSession, AcpInfo, AcpOptions, AcpPromptHandlers, AcpLoopSession, AcpLoopDeps, AcpLoopHandlers) | `src/acp/types.ts` (new) |
| browser.ts + browser-command.ts (BrowserWindow, TabBrowser, BrowserParsed) | `src/browser/types.ts` (new) |
| connections.ts (ConnectionKind, ConnectionParsed) | `src/connection/types.ts` (new) |
| db.ts (DbParsed) | `src/database/types.ts` (new) |
| completion.ts (CompletionResult) | `src/completion/types.ts` (new) |
| logger.ts — `Sinks` (used by `src/controller.ts`, `src/controller/events.ts`) | `src/controller/types.ts` (new) |
| logger.ts — `LogRecord` (used only by `src/transcript/logger.ts`) | `src/transcript/types.ts` (new) |
| messaging.ts (MessageKind, ParsedMsg, ParsedBroadcast) | inline into `src/messaging.ts` (already a single top-level file, no folder) |
| resolve.ts (AppCommand, Resolution) | inline into `src/resolve.ts` (single file, sole consumer) |
| config.ts (NotificationConfig, Config) | inline into `src/config.ts` (single file) |
| user-agent.ts (BrowserProfile) | inline into `src/user-agent.ts` (single file, sole consumer) |

Domains chosen for inlining (no folder) are single-file modules already — creating a folder+
`types.ts` for a one-file domain would add structure without benefit; the existing convention
(e.g. `src/tasks.ts`, `src/config.ts`) keeps small domains as one file.

## Implementation steps

1. Create the 11 new `types.ts` files above, each carrying its group's type definitions verbatim
   (same doc comments), plus any needed cross-file type import (only `profile/types.ts` needs one:
   `AgentState` from `../agent/types.js`).
2. Inline the 4 single-file domains' types directly into their existing implementation file,
   removing their now-redundant `import type { ... } from './types.js'` line.
3. Rewrite `src/types.ts` to a barrel: drop `/* eslint-disable max-lines */` (no longer needed —
   the file will be a handful of re-export lines), and add one `export type { ... } from '...'`
   line per destination file above.
4. Verify no *real* import cycle was introduced: `npx madge --circular --extensions ts src` (per
   the eslint config's own note that `import-x/no-cycle` doesn't reliably fire in this setup).
   Note: `src/types.ts` re-exporting from `resolve.ts`/`messaging.ts`/`config.ts`/`user-agent.ts`
   (files with real runtime imports, unlike the pure domain `types.ts` files) raises madge's count
   from a pre-existing 84 to 186 — but every added edge is a `export type`/`import type` pair,
   fully erased at compile time (confirmed: `tsc`'s emitted `types.js` is `export {};`, zero
   runtime imports). Same category as the pre-existing 84, not a functional regression.

## Tests

No behavior change — this is a pure code-motion refactor. Existing tests continue to exercise the
same runtime code paths (types are erased at compile time); `./scripts/run.mjs check-diff` and a
full `tsc` pass are the verification, not new tests.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, tests.
- `npx tsc --noEmit -p tsconfig.json` — full project typecheck (check-diff is incremental/scoped;
  a change touching 200+ files' resolved types warrants one full pass).
- `npx madge --circular --extensions ts src` — confirm no cycle among the new domain type files.

## Out of scope

- Rewriting any of the 200+ consumer files' import paths — the barrel re-export makes this
  unnecessary, and doing it anyway would be a much larger, purely cosmetic diff.
- Any change to the types themselves (renames, shape changes) — pure relocation only.
- `src/commands/types.ts` (already colocated, pre-existing, unrelated to this split).
