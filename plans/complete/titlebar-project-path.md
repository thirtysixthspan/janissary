# Titlebar shows the full project path

**Complexity: 3/10** — the project directory is already resolved server-side and known per
connection; this just adds one new top-level state field and a `document.title` effect on the
client. No new architecture, a handful of small mechanical edits across the existing state-sync
pipeline.

## Goal

The app's titlebar (the Chrome "app window" mirrors `document.title`) shows `Janissary: <full path>`
instead of the current static `Janissary`, where `<full path>` is the absolute path of the project
directory the server was started against.

## Design decisions

**Reuse the existing state-broadcast pipeline, don't add a new RPC.** The server already resolves
the project directory once at startup (`main.ts` → `startServer`'s `options.projectDir`) and hands
it to `Controller`. Every other piece of server-driven client state (`syntaxTheme`,
`tabNameMaxLength`, ...) flows through the same `StateEvent` → `JanusClient.onState` →
`useServerState` fan-out already in place, so `projectDir` follows the identical path rather than
inventing a new one.

**`Controller` exposes a `rootDir` getter, not a renamed field.** The constructor's private
`projectDir?: string` parameter property is already used by `TabManager`/`WorkspaceManager` and
can't share its name with a public accessor. A new `get rootDir(): string` getter returns
`this.projectDir ?? process.cwd()` — the same fallback `main.ts` already applies before the value
ever reaches `Controller` in the real CLI path, kept here too for any other caller (e.g. tests)
that omits it.

**A dedicated `useProjectTitle` hook, not inline `useEffect` in `App.tsx`.** `App.tsx` is already
at the file-size limit from prior extractions (see `plans/complete/unsaved-editor-changes-on-quit.md`);
a one-line hook call keeps it from growing further and matches the existing pattern of pulling
self-contained effects into their own hook (`useFocusOnTabSwitch`, `useCmdW`, ...).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Project directory resolved at startup | `src/main.ts:126` (`const cwd = args.projectDir ?? process.cwd()`) |
| `Controller` already holds it privately | `src/controller.ts:33` |
| `StateEvent` broadcast on every state change | `src/index.ts:55-59`, `src/message-handler.ts:10-14` |
| Client state fan-out (`onState` → setters) | `web/src/ws.ts`, `web/src/useServerState.ts`, `web/src/App.tsx:128-131` |

## Server changes

1. **`src/controller.ts`** — add `get rootDir(): string { return this.projectDir ?? process.cwd(); }`.
2. **`src/protocol.ts`** — add `projectDir: string;` to `StateEvent`.
3. **`src/index.ts`** — include `projectDir: controller.rootDir` in the `emitState` broadcast object.
4. **`src/message-handler.ts`** — include `projectDir: controller.rootDir` in the `init` reply's state object.

## Web changes

1. **`web/src/ws.ts`** — add `projectDir: string` as a new trailing parameter on the `StateListener`
   type and pass `event.projectDir` through in `onEvent`'s `'state'` case.
2. **`web/src/useProjectTitle.ts`** (new) — `useProjectTitle(projectDir: string): void`; a single
   `useEffect` that sets `document.title = \`Janissary: ${projectDir}\`` when `projectDir` is
   non-empty, skipping the update while it's still the initial `''` (avoids a flash of
   `Janissary: ` before the first state snapshot arrives).
3. **`web/src/useServerState.ts`** — since `projectDir` has no other consumer in `App.tsx` (unlike
   `syntaxTheme`, `tabNameMaxLength`, ...), it's kept as local state inside this hook instead of
   being threaded through `App.tsx`'s own `useState` + `Setters` (which would have pushed
   `App.tsx` over the 200-line limit): reads the new trailing `nextProjectDir` argument from
   `onState`, stores it via its own `useState`, and calls `useProjectTitle(projectDir)`. `App.tsx`
   itself needs no changes for this field.

## Tests

- **`src/controller.test.ts`** — `rootDir` returns the constructor-supplied `projectDir` when given
  one, and falls back to `process.cwd()` when omitted.
- **`web/src/useProjectTitle.test.ts`** (new) — sets `document.title` to `Janissary: <dir>` when
  given a non-empty path; leaves the title untouched when given `''`; updates the title again when
  `projectDir` changes across renders.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related server/web tests.
- Manual (not run in this environment): start the app against a project directory, confirm the
  Chrome app window's titlebar reads `Janissary: <the absolute path>`.

## Out of scope

- Truncating or shortening the path for narrow windows — the issue asks for the full path verbatim.
- Adding a native window-title API; the app already relies on `document.title` mirroring via
  Chrome's `--app=` window mode, unchanged here.
