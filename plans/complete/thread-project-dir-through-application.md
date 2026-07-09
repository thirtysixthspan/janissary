# Thread Project Directory Through Application

**Complexity:** 5/10

## Goal

When a `<project-dir>` positional argument is passed to `janus`, the resolved directory should be used as the root for opening new shells, harnesses, the file navigator, path shortening/expansion, and workspace clone detection — not just for config/state initialization as it is today.

Currently `process.cwd()` is hardcoded in `TabManager.rootDir` (line 28), the root tab's initial cwd (line 34), and `WorkspaceManager.create()` (line 16). The `?? process.cwd()` fallbacks in other managers cascade from these — fixing the source fixes the downstream.

## Approach

Thread the resolved `projectDir` from `main.ts` through `startServer()` → `Controller` → `TabManager`, replacing the hardcoded `process.cwd()` calls. Also thread it through `WorkspaceManager`.

## Implementation Steps

### 1. Add `projectDir` to `ServerOptions` and thread through `startServer` → `Controller`

- **`src/index.ts`**: Add `projectDir?: string` to `ServerOptions`. In `startServer()`, pass it to the `Controller` constructor via a new `Sinks` field (or directly as a constructor parameter). The cleanest approach is to pass it as part of the existing sinks object since the sinks pattern is already established.

Actually, looking at the Controller constructor, it takes `Sinks` which is defined in `src/types.ts`. Let me check if I can just add `projectDir` to `Sinks` or add it as a second constructor parameter.

Let me check the Sinks type.

Actually, the simplest approach: add `projectDir` directly to the Controller constructor as a 2nd parameter. This avoids touching the Sinks type.

### a. `src/index.ts` — add `projectDir` to `ServerOptions`, pass to Controller
```ts
export type ServerOptions = { webDir: string; host?: string; port?: number; token?: string; relaunch?: boolean; projectDir?: string };
// in startServer:
const controller = new Controller({ ... }, options.projectDir);
```

### b. `src/controller.ts` — accept `projectDir` in constructor, pass to TabManager and WorkspaceManager
```ts
constructor(private sinks: Sinks, private projectDir?: string) {
  this.managers.tab = new TabManager(this.managers, projectDir);
  this.managers.workspace = new WorkspaceManager(projectDir);
  // ...
}
```

### 2. Update `TabManager` to use `projectDir`

- **`src/tab-manager.ts`**: Accept `projectDir?: string` in constructor. Use it for `rootDir` (instead of `process.cwd()`) and the root tab's initial cwd.

```ts
constructor(managers: Managers, projectDir?: string) {
  this.rootDir = projectDir ?? process.cwd();
  this.tabs = [this.makeRootTab()];
  this.cwd.set('janus', this.rootDir);
}
```

Remove `private readonly rootDir = process.cwd()` from inline initialization and declare it as a proper instance field.

### 3. Update `WorkspaceManager` to use `projectDir`

- **`src/workspace-manager.ts`**: Accept `projectDir?: string` in constructor. Use it in `create()` instead of `process.cwd()`.

```ts
export class WorkspaceManager {
  private dirs = new Set<string>();
  constructor(private projectDir?: string) {}
  
  create(name: string): { dir: string } | { error: string } {
    const root = findRepoRoot(this.projectDir ?? process.cwd());
    // ...
  }
}
```

### 4. Update `main.ts` — pass `cwd` to `startServer`

```ts
const server = await startServer({ webDir, token: makeToken(), port: args.port, relaunch: args.relaunch, projectDir: cwd });
```

## Tests

No new test cases needed — the existing tests for shell spawning, harness creation, file tree opening, and workspace creation implicitly verify the right cwd is used. Existing tests that mock `process.cwd()` should continue to pass since the fallback chain remains.

However, existing tests for `TabManager` and `WorkspaceManager` may need updating if they rely on the default `process.cwd()` behavior:

- `src/tab-manager.test.ts` — if any tests inspect `launchDir`, `cwdOf('janus')`, or `rootDir`, they may need updating.
- `src/workspace-manager.test.ts` — same, if any test relies on `process.cwd()`.

Affected files to update:
- `src/index.ts` — add `projectDir` to `ServerOptions`, pass to Controller
- `src/controller.ts` — accept `projectDir`, pass to TabManager and WorkspaceManager
- `src/tab-manager.ts` — use `projectDir` for `rootDir` and initial cwd
- `src/workspace-manager.ts` — use `projectDir` for repo root detection
- `src/main.ts` — pass `cwd` to `startServer()`
- `src/index.test.ts` — if any test creates ServerOptions
- `src/controller.test.ts` — if any test creates Controller

## Spec

- `specs/cli.md` — the startup sequence (section "Startup sequence", step 4 and surrounding prose) already says "the resolved `<project-dir>` argument" but the description of how `cwd` flows should be updated to note that the project directory also serves as the default root for shells, harnesses, and file navigation within the application. This is more of a behavioral description.

## Out of scope

- The `?? process.cwd()` fallbacks in individual managers (shell-manager, harness-manager, pty, etc.) are intentionally left as-is. They are hit only when a tab's cwd hasn't been explicitly set (e.g., a brand-new tab before any command), which is an edge case that safely falls back to `process.cwd()`. Fixing the root tab's cwd and `launchDir` addresses the primary gap.
- SSH-manager cwd handling (separate concern — SSH may target remote machines).
- The `initGlobalHistory()` call in `main.ts` — it intentionally uses `~/.janissary/history.json` regardless of project dir.
