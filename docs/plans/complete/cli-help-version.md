# CLI: add `--help` and `--version` flags

**Complexity: 2/10** — one new module around Node's built-in `parseArgs`, two early returns in `boot()`, straightforward unit tests; no protocol or UI surface.

## Goal

`janus --help` prints a usage summary and exits 0. `janus --version` prints the version from `package.json` and exits 0. Today neither flag is recognized: `boot()` in `src/main.ts:98` only looks for `--relaunch`, `--no-open`, and `--port=`, so `janus --help` silently boots the whole server and opens a browser window — the opposite of what the user asked for.

```
$ janus --version
janissary 1.0.0

$ janus --help
Usage: janus [options]

A terminal UI shell with built-in commands and shell execution.

Options:
  --port=<n>    Port to listen on (default: auto)
  --no-open     Start the server without opening the app window
  --relaunch    Reattach to existing state instead of clearing it
  --help        Show this help
  --version     Show version
```

## Design decisions

**Parse in `boot()`, not in the launcher.** `bin/janus.mjs` is a thin trampoline that forwards argv to either `dist/main.js` or `tsx src/main.ts`; putting flag logic there would create a second source of truth and would not cover `npm start` / `tsx src/main.ts` invocations. The cost is that `--version` via the `npx tsx` fallback path is slow, but that path only exists for uninstalled dev checkouts. Keep the launcher untouched.

**Use `node:util` `parseArgs` — no new dependency.** It supports the existing `--port=<n>` syntax (`port` as a `string` option), boolean flags, and `strict` mode. Strict rejection of unknown flags is scoped to the companion plan [cli-strict-args.md](cli-strict-args.md); this plan can land first with `strict: false` and flip the switch later, or both land together.

**Extract a new `src/cli-args.ts` module.** `src/main.ts` is ~136 lines and the 200-line `max-lines` limit leaves little headroom; per `CODE_GUIDELINES.md` the response to size pressure is extraction. The module owns the `parseArgs` config, the usage text, and the version lookup, and exports one function `parseCliArgs(argv): { help: boolean; version: boolean; relaunch: boolean; noOpen: boolean; port?: number }` plus `usageText()` and `appVersion()`.

**Version comes from `package.json` at runtime, not a hardcoded string.** Both run layouts put the entry file one directory below the repo root (`dist/main.js`, `src/main.ts`), so `path.join(import.meta.dirname, '..', 'package.json')` resolves correctly in both. Read with `readFileSync` + `JSON.parse` (typed as `{ name: string; version: string }`); do not use a JSON import assertion — TS project settings vary and `readFileSync` is what the codebase already does in `src/config.ts`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Current ad-hoc flag scan to replace | `src/main.ts:99-102` |
| `boot(argv)` already takes argv as a parameter (testable) | `src/main.ts:98` |
| Launcher that forwards argv (leave as is) | `bin/janus.mjs` |
| `readFileSync` + typed `JSON.parse` pattern | `src/config.ts` (`loadConfig`) |
| Config test patterns to mirror | `src/config.test.ts` |

## Implementation

1. **`src/cli-args.ts`** (new): `parseArgs({ args, options: { help: { type: 'boolean' }, version: { type: 'boolean' }, relaunch: { type: 'boolean' }, 'no-open': { type: 'boolean' }, port: { type: 'string' } }, strict: false })`. Convert `port` with `Number(...)` (validation hardening is in the strict-args plan). Export `usageText()` returning the help block above and `appVersion()` returning `` `${name} ${version}` ``.
2. **`src/main.ts`**: at the top of `boot()`, call `parseCliArgs(argv)`. If `help`, `process.stdout.write(usageText())` and return before any `init*` call (help must not create `.janissary/` directories or clear state). If `version`, same with `appVersion()`. Replace the manual `includes`/`find` lines with the parsed result.
3. **Exit code**: `boot()` returning normally already yields exit 0 for the help/version paths — but note `process.on('exit', killApp)` is registered inside `boot()` *after* the early returns, so nothing lingers. Verify no server or Chrome is started.

## Tests

`src/cli-args.test.ts` (new, mirrors `config.test.ts` style):

- `--version` / `--help` set their booleans; neither is set for a plain `[]` argv.
- `--port=3000` yields `port: 3000`; absent yields `undefined`.
- `--relaunch` and `--no-open` map to `relaunch` / `noOpen`.
- `appVersion()` matches the version in the real `package.json` (read it in the test too — no hardcoded string, per the no-locale-trust practice keep the assertion structural).
- In `boot()`-level coverage (if `controller.test.ts` patterns allow cheaply): `boot(['--help'])` resolves without binding a port. Otherwise rely on the unit tests above.

Run `./scripts/run.mjs check-diff` after the change.
