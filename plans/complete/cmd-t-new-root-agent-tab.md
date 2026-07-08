# Cmd+T opens a new agent tab rooted at the project, not workspaced

**Complexity: 2/10** — one new branch in `useWindowKeys.ts`'s existing chord-key dispatcher,
reusing the already-shipped non-workspaced `agent` command path; one keyboard-navigation spec row.

## Goal

`Cmd+T` should create a new agent tab rooted at the project's actual working directory (where the
app was launched from), the same as typing bare `agent` at the command line — never a workspaced
tab (which is what `agent --workspace`/`-w` or `-w` opts into).

## Background (verified)

- `Cmd+T` is **not currently bound to anything** — it does not exist in the codebase today. Only
  `Ctrl+T` exists, in `web/src/useWindowKeys.ts:84` (`handleTabShortcuts`,
  `e.ctrlKey && e.key.toLowerCase() === 't'` → `client.send({ method: 'toggleCollapse', params: {} })`),
  which expands/collapses the active tab's collapsed agent tool-step runs (documented in
  `specs/keyboard-navigation.md:23` and `specs/transcript.md`). `web/src/useCmdW.test.tsx:75`
  even asserts `metaKey+'t'` is currently a no-op — confirming Cmd+T is unclaimed. This is an
  addition, not a fix to broken behavior.
- Disambiguation is by modifier: `e.ctrlKey` (existing, tool-step collapse) vs. `e.metaKey`
  (to add, new tab) — the same pattern already used to tell Ctrl+E-family shortcuts apart from
  Cmd-family ones in `handleChordKeys` (`useWindowKeys.ts:89-100`): e.g. `e.metaKey && key ===
  'f'` (search) and `e.metaKey && key === 'e'` (queue popup) sit beside `e.ctrlKey && key === 'r'`
  (history) and `e.ctrlKey && key === 'g'` (tab nav).
- The **non-workspaced new-agent-tab path already exists and should be reused as-is**, no server
  changes needed: `src/commands/agent.ts:6` routes a plain `agent` command (no `--workspace`/`-w`
  flag) to `ProfileManager.newAgent()` (`src/profile-manager.ts:33-62`). There,
  `parsed.workspace` is falsy, so `workspaceDir` stays `undefined` (`profile-manager.ts:42-47`),
  and the tab is rooted with `this.managers.tab.setCwd(resolved, workspaceDir ?? process.cwd())`
  (`profile-manager.ts:56`) — `process.cwd()` being the project root the app was launched from
  (per `specs/root-path.md`). Whether a tab is workspaced is represented on the `Tab` type by
  `workspaceDir?: string` (`src/types.ts:168`) — absent means rooted at the project.
- `Callbacks.runCommand` (`useWindowKeys.ts:33`) is already wired in `web/src/App.tsx` to
  `client.send({ method: 'command', params: { text } })` — the same pipeline that runs whatever
  is typed at the command line and pressed Enter. Sending `'agent'` through it lands in
  `commands/agent.ts` → `profile-manager.ts newAgent()` with no `--workspace`/`-w` flag,
  producing exactly the desired root-project, non-workspaced tab.
- Reliability note: other Cmd-chord shortcuts already in `handleChordKeys` (Cmd+F, Cmd+E) rely on
  a plain (non-capture) `keydown` listener plus `e.preventDefault()` to suppress the browser's own
  reserved shortcut (Cmd+F is browser "find" too) — this already works for those, so Cmd+T should
  follow the same convention rather than the capture-phase/iframe workaround `useCmdW.ts` uses
  for Cmd+W (that extra complexity there is specifically for the cross-origin page-tab iframe
  case, not a general reliability need).

## Approach

Add a `Cmd+T` branch to `handleChordKeys` in `useWindowKeys.ts`, alongside Cmd+F/Cmd+E, that calls
`cb.runCommand('agent')`.

## Implementation

1. **`web/src/useWindowKeys.ts:89-100`** (`handleChordKeys`) — add:
   ```ts
   if (e.metaKey && e.key.toLowerCase() === 't') { e.preventDefault(); cb.runCommand('agent'); return true; }
   ```
   placed alongside the other `e.metaKey` branches (Cmd+F, Cmd+E).
2. **`specs/keyboard-navigation.md`** — add a `Cmd+T` row to the table, next to the existing
   `Ctrl+T` row, documenting the new binding and clarifying it is distinct from `Ctrl+T`.

## Tests

Extend `web/src/useWindowKeys.test.ts` (following the existing `'Cmd+E opens the queue popup'`
test at line 141):

1. `'Cmd+T runs the agent command to open a new root-project tab'` — render with a `runCommand`
   spy, dispatch `dispatchKey('t', { metaKey: true })`, assert `runCommand` was called with
   `'agent'`.
2. `'Ctrl+T still toggles tool-step collapse, not Cmd+T's new-tab action'` (optional, if not
   already implied) — dispatch `dispatchKey('t', { ctrlKey: true })` and assert `runCommand` was
   **not** called with `'agent'` (existing `toggleCollapse` behavior via `client.send` is
   untouched and already covered elsewhere).

## Verification

Manual: run the web app, press Cmd+T, confirm a new agent tab opens rooted at the project
directory (no `(workspace: ...)` notice in its output, matching typing `agent` and pressing
Enter). Not runnable in this environment — note as unverified manually if so.

## Out of scope

- Any change to `Ctrl+T`'s existing tool-step collapse behavior.
- Any change to the `agent --workspace`/`-w` workspaced-tab creation path.
- Browser-shortcut suppression edge cases beyond the existing `e.preventDefault()` convention
  already used for Cmd+F/Cmd+E (no capture-phase or iframe fallback, per the reliability note
  above).
