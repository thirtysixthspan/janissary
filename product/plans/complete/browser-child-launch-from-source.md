# Plan: Launch the e2e browser child from whichever runtime the server is running

**Complexity: 3/10** — one new module of pure resolution, three lines changed in its caller, and tests that pin both layouts. No new dependency, no change to confinement or to the child's own arguments.

## Goal

`spawnBrowserChild` builds its child command as `process.execPath` plus `path.join(import.meta.dirname, '..', 'main.js')`. That is right for exactly one of the two ways Janissary is run.

`package.json` runs `npm start` as `tsx src/main.ts` and `dev:server` as `tsx --watch src/main.ts`, and `tsconfig.json` emits to `dist/` rather than beside the sources. So in a source run this module lives at `src/browser/e2e-server.ts` and the entry it computes is `src/main.js` — a file that does not exist. Every `-b` launch from `npm start` or `dev:server` therefore spawns a Node process that exits immediately with `ERR_MODULE_NOT_FOUND`, the child's `exit` handler fires, and the user gets an "e2e browser exited" notification instead of a browser. Nothing in the suite catches it, because `child_process.spawn` is mocked and a mock accepts a path to nothing.

The child must start from the same tree and under the same runtime as the parent, in both layouts.

## Approach

Add `src/browser/e2e-child-command.ts`, a pure resolver, and have `spawnBrowserChild` use it.

**Resolve from what the parent is demonstrably running, not from what is on disk.** `bin/janus.mjs` picks a layout by testing whether `dist/main.js` exists, which is right at the outer boundary — nothing is running yet — and wrong here: inside a source run that file is either absent or a stale build of different code, and launching it would silently run the wrong Janissary. Two facts already in the process say the answer exactly:

- `import.meta.filename` ends in `.ts` when this module was loaded from `src/` through tsx, and `.js` when it was loaded from `dist/`. The sibling entry is `main` with that same extension, resolved relative to the module's own directory, so it always names the tree the parent is running.
- `process.execArgv` carries whatever made that tree runnable. Under tsx it is exactly the loader chain — a `--require` preflight and an `--import` loader, both inside the installation's own `node_modules/tsx/` — and, verified against `tsx --watch`, tsx's watch mode is implemented in the parent and leaks nothing into it. Under plain Node it is whatever flags the operator passed.

**Forward the loader chain only in the source layout.** A built installation keeps launching its child as bare `node dist/main.js`, exactly as today. Forwarding the parent's own flags there would be a behaviour change with a real failure mode — an operator's `--inspect=<port>` would be inherited by a child that then cannot bind it — and buys nothing, since a built tree needs no loader.

**Confinement and environment are untouched.** The command still goes through `sandboxSpawn` with the browser profile, the same `workspaceDir`, and the same `appDir` — the installation root, which is two levels above `src/browser/` and above `dist/browser/` alike, so the carve-in already covers both `src/main.ts` and the `node_modules/tsx/` files the loader chain names. `TMPDIR` and the scratch allocation are unchanged.

## Implementation steps

1. Add `src/browser/e2e-child-command.ts` exporting `ChildRuntime`, `janissaryEntry(moduleFile)`, and `resolveChildLaunch(runtime)` returning `{ command, args }`, where `args` is the interpreter arguments through the entry path.
2. In `src/browser/e2e-server.ts`, replace the hard-coded `main.js` join with a `resolveChildLaunch({ moduleFile: import.meta.filename, execPath: process.execPath, execArgv: process.execArgv })` call, pass its `command` and `args` into `sandboxSpawn` with the browser arguments appended, and leave `appDir`, the profile selection, and the environment as they are.
3. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/browser/e2e-child-command.test.ts` (new) — both layouts driven from explicit runtimes, since only one of them can be the one the suite itself runs under:
  - a source runtime (`/app/src/browser/e2e-server.ts` with tsx's `--require`/`--import` pair) resolves the entry to `/app/src/main.ts`, keeps `process.execPath` as the command, and places the loader arguments before the entry in that order;
  - a built runtime (`/app/dist/browser/e2e-server.js`, empty `execArgv`) resolves to `/app/dist/main.js` with the entry as the only argument;
  - a built runtime whose `execArgv` carries an operator flag still launches bare, so an inherited `--inspect` cannot follow the child;
  - the entry is always a sibling-of-parent path, never a `dist` lookup: a source runtime resolves to `src/main.ts` even when a `dist/main.js` would exist.
- `src/browser/e2e-server.test.ts` — the launch contract, with `node:fs` unmocked so a path to nothing cannot pass:
  - the spawned command is `process.execPath` and the child entry it is given exists on disk;
  - the entry is followed by `e2e-browser` and the port, ws-path, and dir arguments, in that order, so the loader arguments never displace the subcommand;
  - `sandboxSpawn` receives the same command and argument list that reaches `spawn`, so confinement wraps the resolved launch rather than a stale one.

## Spec and documentation

None. This is a launch-resolution defect: `-b` is specified to start a browser, and it now does so from a source run as well as a built one. No flag, command, output, or documented behaviour changes.

## Out of scope

- Changing how `bin/janus.mjs` picks its own layout. Its `existsSync(dist/main.js)` preference is correct at the outer boundary, where no Janissary is running yet.
- Any other child Janissary spawns. `remote-serve` is launched over ssh on the far host, where the local layout says nothing about the remote one.
- The other browser findings in `product/backlog/pull-request.md`.
