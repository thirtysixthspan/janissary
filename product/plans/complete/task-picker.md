# Task Picker

**Complexity: 3/10** — the picker itself copies well-established precedents (`hist` for shape, `queue` for populate-don't-submit) and the wire field follows `globalHistory` exactly; what drives the number is breadth, not depth: two small no-behavior-change refactors first (lifting `recallRef` to `App.tsx`, extracting `useHistPicker` to keep `App.tsx` under `max-lines`) and a long tail of small call sites to catch (`help.md`, the never-queues lists in spec and user docs, the Cmd+W gate, the screenshot manifest).

## Summary

Add a `Ctrl+A` popup (and a `tasks` command as its non-chord opener) that lists the executable task files in the repo's top-level `ai/` directory — `build-a-feature.md`, `fix-a-small-issue.md`, `merge-change-to-master.md`, etc. Arrow keys move the selection; Enter copies `execute ./ai/<filename>` into the command line and closes the popup **without submitting** — the user lands with the command pre-filled, cursor at the end, free to append or edit before pressing Enter themselves to actually send it. Escape closes the popup with no change to the command line. This mirrors the `queue` (`Ctrl+E`) popup's "selection populates the command line as the sole edit surface" behavior more closely than `hist`'s "Enter runs immediately" — see Decision 2.

## Decisions (to be confirmed with user)

1. **Task source: top-level `ai/*.md` only, not `ai/guidelines/` or `ai/personas/`.** The feature request says "lists tasks from the `./ai/` directory that can be executed." The existing convention in `commands.md` (`execute ./ai/improve-modularity.md`, `execute ./ai/fix-a-small-issue.md`, …) confirms these are the flat files directly under `ai/`, not the subdirectories — `ai/guidelines/` holds binding project docs (not runnable tasks) and `ai/personas/` holds `monitor` persona bodies (a different, already-served concept via `listPersonas`). The picker lists only `*.md` files directly in `ai/` (non-recursive), sorted alphabetically, same as `listPersonas`.
2. **Enter populates the command line; it does not submit.** Per the user's explicit request: selecting a task must let the user supplement or edit the command before it runs — e.g. appending extra instructions after `execute ./ai/build-a-feature.md`, or fixing something. So Enter does **not** call `runCommand`; it writes `execute ./ai/<filename>` into the command line via the same `recall`/`recallRef` mechanism the `queue` popup already uses to push a selected row's text into the input (`web/src/CommandInput.tsx:44-48`, `web/src/useQueuePicker.ts:29-34`), closes the popup, and leaves focus in the input with the cursor at the end. The user presses Enter themselves when ready. `execute ./ai/<file>` itself still isn't a structured Janissary command — grep confirms no `src/commands/execute.ts` — it's freeform text interpreted by the agent (see `commands.md`, `src/controller.test.ts:1157`); this plan only changes *when* it's sent, not what it is.
3. **List source of truth: server, refreshed on every state push.** `ai/*.md` is disk content the user can add to/edit at any time (unlike `SYNTAX_THEMES`, which is a compiled-in constant). Per architecture principle 1 (server owns anything not purely ephemeral view state), the list is read server-side and shipped down as a new `tasks: string[]` field on `StateEvent`, following the wire-shape precedent of `globalHistory: string[]` (also a flat, non-per-tab list already on `StateEvent`) rather than inventing a new request/response RPC. One cost caveat the precedent doesn't cover: `globalHistory`'s backing list is in-memory (`globalCommands()` at `src/global-history.ts:50-53` maps over a module-level array), while `tasks` is a disk read — and `emitState` broadcasts on essentially every mutation, including each PTY output chunk (architecture principle 8). So `listTasks` must stay one syscall: a single `readdirSync` with `withFileTypes: true` filtered on `dirent.isFile()`, no per-file `statSync` pass. A readdir of a ~15-entry directory per broadcast is noise; a stat per file per broadcast is not. If profiling ever says otherwise, an mtime cache can come later — do not build one now.
4. **No explicit tab-type gate (like `hist`) — but the picker is only reachable where the command bar renders.** `useTaskPicker` gets no `isAgentTab` guard (unlike `queue`'s `openQueue`, `web/src/useQueuePicker.ts:36-40`). In practice that means transcript tabs (`view` undefined or `'agent'`) with no active full-tab PTY: `PickerOverlays` and `CommandArea` render only inside App's `{!isViewTab && !current.activePty && (` block (`App.tsx:178`), so those are the only tabs with a command line to populate. On harness and shell tabs the chord never reaches the window handler at all — xterm's custom key handler forwards Ctrl+A to the PTY (`useXterm.ts:45-54`; `harnessKeyFilter` at `HarnessTab.tsx:10-14` and `ShellTab.tsx:12`'s equivalent bubble only the Shift+arrow tab-switch chord) — which is what we want: terminal Ctrl+A (shell line-start, tmux prefix) keeps working untouched. An in-transcript terminal card does bubble ctrl-chords to the window (`cardKeyFilter`, `TerminalCard.tsx:12`), exactly as it already does for `Ctrl+R`/`Ctrl+E`; nothing new to handle there.
5. **Chord: `Ctrl+A`.** Not unbound everywhere — the editor maps Ctrl+A to Emacs-style line-home (`ctrlAction`, `web/src/editor/keys.ts:52`) — but there is no conflict: `EditorTab`'s `onKeyDown` calls `e.stopPropagation()` on every keydown precisely so nothing typed in the editor reaches App's global bindings (`web/src/EditorTab.tsx:133-141`). At the window level the chord is unclaimed (`handleChordKeys`, `web/src/useWindowKeys.ts:89-101`, handles only f/r/g/e/t). In the command-line textarea, the handler's `e.preventDefault()` suppresses native Ctrl+A (cursor-to-line-start on macOS, select-all elsewhere) the same way `Ctrl+R`/`Ctrl+E`/`Ctrl+G` already do — and taking an Emacs-style key from the textarea has precedent: `Ctrl+E` (end-of-line) already belongs to the queue popup.

## Verified codebase facts that shape the design

- **`hist` supplies the picker shape; `queue` supplies the "populate, don't submit" behavior.** `web/src/HistoryPicker.tsx` (27 lines) — list of strings, `selected` index, `onPick(item)`, row click or Enter calls `onPick` — is still the component template. `web/src/keyboard-handlers.ts:20-35` `handlePickerKey` is a generic Arrow/Enter/Escape-over-`string[]` handler already used for *both* `hist` and the syntax-theme picker; it's agnostic about what its "run" callback does, so it can be reused verbatim for tasks even though that callback now populates instead of submits (third caller, no signature change needed).
- **The recall mechanism (how `queue` populates without submitting) is the piece to copy for Enter's new behavior.** `web/src/CommandInput.tsx:44-48`: `const recall = (text: string) => { setValue(text); requestAnimationFrame(() => { .../* cursor to end */ }); }; if (recallRef) recallRef.current = recall;` — `CommandInput` assigns this closure into a ref supplied by its parent on every render, so any caller holding that same ref object can push text into the live command line without triggering submission. `web/src/useQueuePicker.ts:29-34` `selectQueueIndex` is the existing consumer: `recallRef.current?.(text); inputRef.current?.focus();`. Today `recallRef` is created inside `useQueuePicker` (`web/src/useQueuePicker.ts` — a bare `useRef` per the file) and is the *only* consumer; `CommandInput`/`CommandArea` each accept exactly one `recallRef` prop (`web/src/CommandInput.tsx:20`, `web/src/CommandArea.tsx:19`), so a second independent ref can't also be wired in — the ref's ownership needs to move up to `App.tsx` and be shared by both `useQueuePicker` and the new `useTaskPicker` (see step 6).
- **Chord wiring lives in three places that always change together:** `web/src/useWindowKeys.ts` (`StateSnapshot`/`Callbacks` types, `dispatchModalKey`'s priority chain, `handleChordKeys`'s chord list), `web/src/PickerOverlays.tsx` (the mutually-exclusive render stack), and `App.tsx` (state, the live-ref snapshots at `App.tsx:94-98` and `App.tsx:143-148`, and the `PickerOverlays` props at `App.tsx:198-204`). No open-gate (`canSearch`, `isAgentTab`) applies here — but there is a fourth, easy-to-miss touchpoint: the Cmd+W guard `pickerOpenRef` at `App.tsx:113` (see step 6).
- **`listPersonas` (`src/personas.ts:42-51`) is the template for the new listing function**: `readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).toSorted(...)`, wrapped in try/catch returning `[]`. Two deliberate deviations for tasks: keep the `.md` extension in the returned name (the populated command is `execute ./ai/<filename incl. extension>`), and read dirents (`withFileTypes: true` + `isFile()`) instead of bare names — see step 1 and Decision 3 for why.
- **`StateEvent` and `emitState` are the wiring for shipping the list to the client**, exactly like `globalHistory`: `src/protocol.ts:73-78` (add `tasks: string[]` as a required sibling field, same non-optional treatment as `globalHistory`/`syntaxTheme`), `src/index.ts:54-58` `emitState` (add `tasks: listTasks()`), `src/message-handler.ts:9-13` (same, for the `init` reply), `web/src/ws.ts:3,29,88` (`StateListener` signature gains a `tasks: string[]` parameter, `onState` callback call site passes `event.tasks`).
- **No new RPC, no new server-side command for "run."** `execute ./ai/<file>` still reaches the pane through the existing generic `{ method: 'command', params: { text } }` RPC once the user submits it themselves (`App.tsx:82`) — confirmed there is no `src/commands/execute.ts`. This plan adds no new send path; it only changes which UI action populates the input versus which one submits it.
- **A `tasks` bare-word command should still exist as the non-chord opener**, mirroring `hist`/`queue`/`syntax theme`'s convention of "typed bare command opens the picker client-side; interception happens in `useCommandBarSubmit.ts`, not via a route or a server round-trip" (`web/src/useCommandBarSubmit.ts:35-38`). A minimal server-side `src/commands/tasks.ts` no-op stub must exist too, matching `src/commands/hist.ts` — and the precise reason is dispatch, not help or completion: registration in `src/commands/index.ts` is what makes `resolveCommand` classify the word as an app command (`src/resolve.ts:28-32`, `for (const c of commands) if (c.match(command))`); without it, a `tasks` reaching the server non-interactively (a schedule, `send`, another agent) falls through to `getOutput` and prints `Unknown command: "tasks". Type "help" for available commands.` (`src/commands.ts:38-58`). There is no command-name tab-completion to feed (`src/completion.ts` completes arguments and file paths only), and no `availableCommands` entry is needed — that list (`src/commands.ts:6-24`) only feeds the fallback help text used when `help.md` is unreadable, and `queue` already set the precedent of skipping it. The real `help.md` does need new rows — see step 9.

## Proposed changes

### What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Picker component shape (list + selected + onPick) | `HistoryPicker.tsx` | `web/src/HistoryPicker.tsx` |
| Arrow/Enter/Escape key handling over a `string[]` | `handlePickerKey` | `web/src/keyboard-handlers.ts:20-35` |
| Chord open/dispatch wiring | `Ctrl+R` → `openPicker()` | `web/src/useWindowKeys.ts:53-101` |
| Mutually-exclusive overlay stack | `PickerOverlays.tsx` | `web/src/PickerOverlays.tsx` |
| Directory-of-`.md`-files listing | `listPersonas()` | `src/personas.ts:42-51` |
| Global (non-per-tab) list on the wire | `globalHistory: string[]` on `StateEvent` | `src/protocol.ts:76`, `src/index.ts:57` |
| Bare-word command opens picker client-side | `trimmed === 'hist'` branch | `web/src/useCommandBarSubmit.ts:36` |
| No-op server command stub | `src/commands/hist.ts` | `src/commands/hist.ts` |
| Populate the command line without submitting | `recall`/`recallRef`, `selectQueueIndex` | `web/src/CommandInput.tsx:44-48`, `web/src/useQueuePicker.ts:29-34` |
| Extracted picker-state hook shape (open flag + index + open/pick) | `useThemePicker` | `web/src/useThemePicker.ts` |
| Sending text to the exposed pane (once the user submits) | `runCommand(text)` → `{ method: 'command', params: { text } }` | `App.tsx:82` |

### 1. Server: task listing

- New `src/tasks.ts` exporting `listTasks(root: string = process.cwd()): string[]`, modeled directly on `listPersonas` (`src/personas.ts:42-51`) but simpler — no per-file parsing, just names. Contract: one `readdirSync` of `path.join(root, 'ai')` called with `{ withFileTypes: true }`; keep entries where `dirent.isFile()` and the name ends in `.md`; return the names sorted with `localeCompare` (same comparator as `listPersonas`); return `[]` on any error (missing or unreadable `ai/`) via the same try/catch shape. The `isFile()` check excludes `guidelines/` and `personas/` without hardcoding their names — any future subdirectory under `ai/` is excluded the same way — and reading dirents instead of running a per-file `statSync` keeps the whole function to a single syscall, which matters because it runs inside every `emitState` broadcast (see Decision 3). Keep the `.md` extension in each returned entry (needed verbatim for `execute ./ai/<name>`); this deliberately differs from `listPersonas`, which strips it.
- `src/tasks.test.ts`: empty-dir/missing-dir returns `[]`; returns only top-level `.md` files; excludes subdirectories (create one inside the temp fixture); sorted alphabetically. `src/personas.test.ts` exists — follow its fixture/setup shape.

### 2. Wire: `tasks` field on `StateEvent`

- `src/protocol.ts:73-78` (`export type StateEvent`): add `tasks: string[];` as a required sibling field next to `globalHistory` (line 76). There is no mirrored `web/src/protocol.ts` to keep in sync — the web side imports this same file via the `@shared/*` alias (`web/tsconfig.json:13`, `web/vite.config.ts:13`).
- `src/index.ts:54-58` `emitState`: add `tasks: listTasks(),` to the broadcast literal.
- `src/message-handler.ts:9-13`: same addition to the `init` reply (verified: it duplicates the state literal rather than sharing a helper with `index.ts` — both literals gain the field; these are the only two `t: 'state'` construction sites in `src/`).
- `web/src/ws.ts`: `StateListener` type (`line 3`) gains a `tasks: string[]` parameter (append after `syntaxTheme` to match field order); the `case 'state':` handler (`line 26-29`) passes `event.tasks` through to listeners.
- `web/src/App.test.tsx:7-10` declares its own six-parameter `StateListener` for the mocked client, and each `stateListener!(...)` call passes positional args — extend the local type and those calls with the new trailing `tasks` argument (`[]` is fine) so the mock keeps matching the real wire shape instead of leaving App's `tasks` state `undefined`.

### 3. Server: `tasks` command stub

- New `src/commands/tasks.ts`, copied from `src/commands/hist.ts`:
  ```ts
  export const command: Command = {
    name: 'tasks',
    match: (command_) => command_.toLowerCase() === 'tasks',
    run: () => { /* no-op on the server; the picker is interactive and client-side (Ctrl+A) */ },
  };
  ```
- Register in `src/commands/index.ts`: import next to `hist`, add `tasks` to the exported array (alphabetical-ish placement near `state`/`syntax` is fine, following the file's existing loose grouping).
- `src/commands/tasks.test.ts`: `match` accepts `tasks`/`Tasks` (case-insensitive), rejects near-misses (`tasks foo`, `task`); `run` is a no-op (doesn't throw, doesn't append transcript output). `src/commands/hist.test.ts` exists — mirror its shape (name / case-insensitive match / non-match cases).

### 4. Web: `TaskPicker` component

- New `web/src/TaskPicker.tsx`, copied from `HistoryPicker.tsx` with the title changed to `tasks` and the empty-state message changed to `(no tasks)`:
  ```tsx
  type Properties = { items: string[]; selected: number; onPick: (task: string) => void };
  export function TaskPicker({ items, selected, onPick }: Properties) {
    return (
      <div className="picker" data-doc-shot="task-overlay">
        <div className="picker-title">tasks</div>
        {items.length === 0 ? (
          <div className="picker-row picker-empty">(no tasks)</div>
        ) : (
          items.map((name, index) => (
            <div key={index} className={`picker-row${index === selected ? ' selected' : ''}`} onClick={() => onPick(name)}>
              {name}
            </div>
          ))
        )}
      </div>
    );
  }
  ```
  `onPick` receives the bare filename (e.g. `fix-a-small-issue.md`); the caller (see step 6) prefixes `execute ./ai/` and writes it into the command line — it does not run it.

### 5. Web: chord + dispatch wiring

- `web/src/useWindowKeys.ts`:
  - `StateSnapshot`: add `taskPickerOpen: boolean; taskPickerIdx: number; tasks: string[];`.
  - `Callbacks`: add `setTaskPickerIndex: (setter: (prev: number) => number) => void; setTaskPickerOpen: (open: boolean) => void; openTaskPicker: () => void; pickTask: (name: string) => void;`.
  - `dispatchModalKey`: add a branch calling `handlePickerKey(e, snap.tasks, snap.taskPickerIdx, cb.setTaskPickerIndex, cb.pickTask, cb.setTaskPickerOpen)` — same call shape as the existing `hist` branch, reusing `handlePickerKey` directly (no new key-handling function needed). Placement in the priority chain: after `queueOpen` (least contended chord, no urgency over the others).
  - `handleChordKeys`: add `if (e.ctrlKey && e.key.toLowerCase() === 'a') { e.preventDefault(); cb.openTaskPicker(); return true; }`.
- `web/src/PickerOverlays.tsx`: add `taskPickerOpen`, `tasks`, `taskPickerIndex`, `onPickTask` props; add `if (taskPickerOpen) return <TaskPicker items={tasks} selected={taskPickerIndex} onPick={onPickTask} />;` to the exclusive stack (after the `queueOpen` branch, matching the priority order above).

### 6. Web: state + handlers in `App.tsx` (and sharing `recallRef`)

`App.tsx` sits at ~199 countable lines against the `max-lines` **error** at 200 (`eslint.config.mjs:60`, `skipBlankLines: true, skipComments: true` — 235 raw lines), so the additions below will tip it over. Plan the offsetting extraction up front rather than reacting to lint mid-implementation:

- **Extract the `hist` picker state into a new `web/src/useHistPicker.ts`** mirroring `useThemePicker.ts`'s shape (open flag + index + open/pick functions returned as one object; that file's header comment even says it "mirrors the `hist` picker's shape in App, split out to keep App.tsx under the file-size limit" — this completes the move for `hist` itself). Move the `pickerOpen`/`pickerIndex` state (`App.tsx:45-46`) and `openPicker`/`pick` (`App.tsx:100-105`) into it, taking `recent` and `runCommand` as parameters. `openPicker` today reads `stateReference.current.recent` purely as a freshness indirection; a plain `recent` parameter behaves identically because every consumer re-reads the callback each render (`keyCallbacksRef` is a live ref rebuilt per render, and `useCommandBarSubmit` re-memoizes on `openPicker`). No new test file needed — `useThemePicker` has none either; the existing `App.test.tsx` interception tests cover the behavior. Land this together with the `recallRef` lift in implementation-order step 4 as the no-behavior-change refactor.

Then keep the feature addition itself to a single hook, plus the small refactor to share `recallRef` between `useQueuePicker` and the new hook:

- **Lift `recallRef` ownership to `App.tsx`.** Add `const recallReference = useRef<((text: string) => void) | null>(null);` in `App.tsx` next to the other refs (`~line 51-54`). Change `useQueuePicker`'s signature (`web/src/useQueuePicker.ts:9-13`) from creating its own `const recallRef = useRef<...>(null);` internally to accepting it as a fourth parameter — `useQueuePicker(client, current, inputRef, recallRef)` — and drop the internal `useRef` line. This is a same-shape change to an existing, already-tested hook (its own `recallRef` behavior is unchanged; only who allocates the ref moves), analogous to how `guardRef` is already allocated by `App.tsx` and handed down to `useUnsavedQuitGuard`/`CloseSaveGuard` rather than owned by the consumer.
- New `web/src/useTaskPicker.ts`, mirroring `useQueuePicker.ts`'s populate-not-submit shape rather than `hist`'s run-immediately shape:
  ```ts
  export function useTaskPicker(
    tasks: string[],
    recallRef: React.RefObject<((text: string) => void) | null>,
    inputRef: React.RefObject<HTMLTextAreaElement | null>,
  ) {
    const [taskPickerOpen, setTaskPickerOpen] = useState(false);
    const [taskPickerIndex, setTaskPickerIndex] = useState(0);
    const openTaskPicker = useCallback(() => { setTaskPickerIndex(0); setTaskPickerOpen(true); }, []);
    // Populates the command line via the shared recall ref and closes — does not submit, so the
    // user can supplement or edit `execute ./ai/<file>` before running it themselves.
    const pickTask = useCallback((name: string) => {
      recallRef.current?.(`execute ./ai/${name}`);
      setTaskPickerOpen(false);
      inputRef.current?.focus();
    }, [recallRef, inputRef]);
    return { taskPickerOpen, taskPickerIndex, setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask };
  }
  ```
- `App.tsx`:
  - New `const [tasks, setTasks] = useState<string[]>([]);` alongside the existing `syntaxTheme` state (`~line 44`).
  - `client.onState(...)` callback (`line 123-134`): add a `nextTasks` parameter and `setTasks(nextTasks);`.
  - `const { queueOpen, ... } = useQueuePicker(client, current, inputReference, recallReference);` — pass the lifted ref in (`~line 89-91`); the hook no longer returns `recallRef`.
  - `const { taskPickerOpen, taskPickerIndex, setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask } = useTaskPicker(tasks, recallReference, inputReference);` next to it.
  - `stateReference` (`line 94-98`): add `taskPickerOpen, taskPickerIdx: taskPickerIndex, tasks,`.
  - `keyCallbacksRef` (`line 143-148`): add `setTaskPickerIndex, setTaskPickerOpen, openTaskPicker,`.
  - `PickerOverlays` props (`line 198-204`): add `taskPickerOpen={taskPickerOpen} tasks={tasks} taskPickerIndex={taskPickerIndex} onPickTask={pickTask}`.
  - `CommandArea`'s `pickerOpen` prop (`line 215`, gates command-line submission while any picker is open): add `|| taskPickerOpen`.
  - `CommandArea`'s `recallRef` prop (`line 218`, currently fed straight from `useQueuePicker`'s return): now fed by `recallReference` directly, since both hooks share it. Drop `recallRef` from `useQueuePicker`'s return object — no test references it (verified), so only this prop feed changes.
  - `pickerOpenRef` (`App.tsx:113`, `pickerOpenRef.current = pickerOpen || queueOpen;`): add `|| taskPickerOpen`. This ref feeds `useCmdW`'s guard (`web/src/useCmdW.ts:15`) so Cmd+W can't close the tab underneath an open picker — `hist` and `queue` both gate it; the task picker must too.

### 7. Web: bare `tasks` command opens the picker

- `web/src/useCommandBarSubmit.ts`: add `openTaskPicker: () => void;` to `Params`, and `if (trimmed === 'tasks') { openTaskPicker(); return; }` next to the `hist`/`queue` branches (`~line 36-38`; `trimmed` is already lowercased at line 35, so the match is case-insensitive like the server-side `match`). Pass `openTaskPicker` through from `App.tsx`'s `useCommandBarSubmit({...})` call (`~line 152-155`).

### 8. Specs

- New `specs/task-picker.md`, written in the style of `specs/agent-command-queue.md`'s "Queue popup" section (the closest existing precedent for "selection populates the command line, does not submit"): what `ai/*.md` files are (executable task prompts), that the list excludes `ai/guidelines/` and `ai/personas/` (non-recursive, top-level `.md` files only), the `Ctrl+A` chord and `tasks` command as equivalent openers, picker UX — `↑`/`↓` move the selection, `Return` **copies `execute ./ai/<filename>` into the command line and closes the popup without submitting**, leaving the cursor at the end so the user can append or edit before running it themselves, `Escape` closes without changing the command line, a row can also be clicked. State explicitly that this differs from the `hist` picker (which runs immediately on Enter) and matches the `queue` picker's "command line is the edit surface" behavior instead. Empty-state text: `(no tasks)`. Also state that the filename is inserted verbatim with no quoting or escaping — the repo currently contains `ai/open-feature-pull-request copy.md`, which populates as `execute ./ai/open-feature-pull-request copy.md` — because the populated command is freeform text for the agent, exactly as if typed by hand.
- `specs/history.md`: verified scoped to `hist` only (its "History picker" section documents just the `Ctrl+R` picker, and no spec enumerates all picker chords in one place) — no change there.
- `specs/agent-command-queue.md:73-78`: a required behavior-set update, not an optional cross-reference — the "What never queues" section enumerates the client-intercepted commands ("`hist`, `nav`, `syntax theme`, `quit`, `close`/`exit`, and bare `queue`"), and step 7 adds bare `tasks` to that set.
- `specs/application-commands.md`: add a `tasks` entry modeled on the existing `syntax` entry (`specs/application-commands.md:19-21`) — the file's only precedent for a client-intercepted picker opener; it documents both the interception ("opens a … overlay instead of running on the server") and what happens if the command reaches the server directly. There are no `hist`/`queue` entries in this file to mirror; those commands are specced in `specs/history.md` and `specs/agent-command-queue.md` instead.

### 9. Public documentation

- New `public-documentation/command-bar/tasks.md`, modeled directly on `public-documentation/command-bar/queue.md` (the closest existing doc page, since both describe "select a row, it lands in the command line for you to edit/run" rather than `history.md`'s "select a row, it runs"). Cover: what `ai/*.md` task files are and where they live, `Ctrl+A` (or the `tasks` command) opens the popup, `↑`/`↓` to move, **`Return` copies `execute ./ai/<filename>` into the command line without running it** so it can be supplemented or edited, `Escape` closes without changing anything, clicking a row does the same as Enter. Explicitly contrast with `history.md`'s `Ctrl+R` picker ("unlike the history picker, Return here doesn't run the command immediately") since a reader may reasonably expect Enter-runs behavior from the sibling doc page.
- `public-documentation/command-bar/queue.md:35`: the "always handled instantly and never queue" sentence enumerates the same client-intercepted set as the spec ("`hist`, `nav`, `syntax theme`, `quit`, `close`, `exit`, and `queue` itself") — add `tasks`.
- `help.md` (repo root — the output of the `help` command): add a `tasks` row to the built-in commands table (next to the `hist` row at line 12, "Open command history picker") and a `Ctrl+A` row to the key-bindings table (next to `Ctrl+R`/`Ctrl+E` at lines 44-45). Precedent: PR #210 ("docs(help): document the queue command and Ctrl+E binding") did exactly this when the queue popup landed.
- `public-documentation/.vitepress/config.mts`: add a sidebar entry next to the existing `command-bar` entries (`~line 67-72`): `{ text: "Task picker", link: "/command-bar/tasks" },` — placed near `"Command queue"` given the shared behavior, rather than next to `"Command history"`.
- Screenshot: the pipeline is `./scripts/run.mjs docs-screenshots` — `scripts/docs-screenshots/manifest.mjs` declares one entry per shot, and the `history-picker` entry (`manifest.mjs:42-47`: `setup` commands typed into the command bar, an `actions` key-press, `target` naming the `data-doc-shot` attribute) is the template. Add a `task-picker` entry with `target: 'task-overlay'` (the `TaskPicker.tsx` root div carries `data-doc-shot="task-overlay"` per step 4) and a `Control+a` press. One trap: `capture.mjs` drives a fresh app whose cwd is a scratch directory seeded from `scripts/docs-screenshots/fixtures/` (`createScratch`, `scratch.mjs:19-37`), and the fixtures contain **no `ai/` directory** — a bare `Control+a` would capture `(no tasks)`. Create the files with the entry's own `setup` commands (`shell mkdir ai`, then a `shell touch` of three or four realistically named files like `ai/build-a-feature.md`) rather than adding an `ai/` folder to `fixtures/` — a fixture change would also reshuffle the `file-tree` and `file-tree-sidebar` shots, whose arrow-key choreography (`manifest.mjs:67-79`) assumes the current directory listing. Reference the shot from the new doc page, mirroring `history.md`'s `![...](/screenshots/history-picker.png)`.

### 10. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/tasks.test.ts` (step 1), `src/commands/tasks.test.ts` (step 3) — as described above.
- `web/src/TaskPicker.test.tsx`: renders one row per item, marks `selected`, empty state shows `(no tasks)`, row click calls `onPick` with that row's filename. Mirror `web/src/HistoryPicker.test.tsx` (exists).
- `web/src/useTaskPicker.test.ts`: `openTaskPicker` resets index to 0 and opens; `pickTask` calls `recallRef.current` with `'execute ./ai/' + name` (not any `runCommand`/submit function), closes the popup, and does not itself dispatch a command.
- `web/src/useQueuePicker.test.tsx` (note the `.tsx` extension): update for the new `recallRef` parameter — its `TestComponent` (`useQueuePicker.test.tsx:16-22`) and the inline components construct the hook with the current three-argument signature, so each gains a locally created ref as the fourth argument. No assertion changes: nothing in the test suite references `recallRef` (verified), and the hook's recall behavior is unchanged.
- `web/src/App.test.tsx`: the mock `StateListener` extension from step 2.
- `web/src/useWindowKeys.test.ts` (exists): `Ctrl+A` calls `openTaskPicker`; when `taskPickerOpen` is true, Arrow/Enter/Escape route through `handlePickerKey` against `snap.tasks`, and Enter's callback is `pickTask` (populate), not a submit function.

## Implementation order

1. `src/tasks.ts` + `src/tasks.test.ts` — no dependents yet, safe first step.
2. `StateEvent.tasks` (`src/protocol.ts`) + `emitState`/`message-handler.ts` wiring + `web/src/ws.ts` `StateListener` + `App.test.tsx`'s mock listener — wire the list end-to-end before any UI consumes it; verify with a quick manual check (e.g. a temporary `console.log` in `App.tsx`'s `onState`, removed before commit) that `tasks` arrives populated.
3. `src/commands/tasks.ts` + registration + tests — `tasks` is now typeable and no-ops harmlessly server-side.
4. The two no-behavior-change `App.tsx` refactors: lift `recallRef` to `App.tsx` and thread it into `useQueuePicker` (signature change), and extract `web/src/useHistPicker.ts` (see step 6's preamble) — land and verify `check-diff` with **no behavior change** to the existing queue and hist popups before adding the new consumer, so a regression here is caught in isolation from the new feature.
5. `web/src/TaskPicker.tsx` + `web/src/useTaskPicker.ts` + tests — component and hook exist and are unit-tested in isolation before wiring.
6. `web/src/PickerOverlays.tsx` + `web/src/useWindowKeys.ts` (`Ctrl+A` chord, `dispatchModalKey` branch) + `App.tsx` wiring (state, live refs, `pickerOpenRef`, props, shared `recallRef`) — the picker becomes reachable via `Ctrl+A`.
7. `web/src/useCommandBarSubmit.ts` — `tasks` bare command becomes the second opener.
8. Specs (`specs/task-picker.md`, the `specs/agent-command-queue.md` never-queues list, the `specs/application-commands.md` entry).
9. Public documentation and help (`public-documentation/command-bar/tasks.md` + sidebar entry, the `queue.md:35` never-queues sentence, `help.md` rows, the screenshot manifest entry + capture).

Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

- Submitting the command automatically — the entire point of this plan (per explicit user instruction) is that Enter populates, never submits; a "run immediately" variant is not part of this feature.
- Recursing into `ai/guidelines/` or `ai/personas/`, or surfacing `skills/` — Decision 1 scopes this to the flat `ai/` directory only.
- Editing, creating, or deleting task files from the picker — read-only listing, same as `hist`.
- A distinct RPC or server-side "run task" command — Decision 2 keeps this as plain text through the existing generic command path, sent only once the user submits normally.
- Multi-select or queuing multiple tasks at once from the popup — one selection populates one command line, same as `queue`'s single-row recall.

## Verification

- Run `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end check: start the app, focus an agent tab, press `Ctrl+A` — confirm the popup lists every `.md` file directly under `ai/` (and none from `ai/guidelines/`/`ai/personas/`), alphabetically sorted; arrow through entries; press Enter on `fix-a-small-issue.md` and confirm the popup closes, **nothing is submitted**, and the command line now reads `execute ./ai/fix-a-small-issue.md` with the cursor at the end; type additional text after it and press Enter, confirming the supplemented command is what actually gets sent to the tab; reopen the popup and press Escape, confirm it closes with the command line unchanged; while the popup is open, press Cmd+W and confirm the tab does not close (the `pickerOpenRef` gate); type `tasks` on the command line and confirm it opens the same popup; on a harness tab, confirm `Ctrl+A` goes to the terminal itself (cursor jumps to line start in a shell) and that no popup appears there or later when switching back to an agent tab (per Decision 4, the chord is terminal-owned on those tabs); after step 4's refactors, re-verify the `Ctrl+E` queue popup still recalls/edits correctly and the `Ctrl+R` hist popup still opens on the most recent entry and runs on Enter.
- Type `help` and confirm the new `tasks` and `Ctrl+A` rows render in its output.
- Confirm the new `public-documentation/command-bar/tasks.md` page renders via `npm run docs:dev` and is reachable from the sidebar, and that `./scripts/run.mjs docs-screenshots` produces a `task-picker` shot showing a populated picker (not `(no tasks)`).
