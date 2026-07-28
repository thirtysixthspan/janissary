# Fix the stale filename references in source comments across src/

**Complexity: 3/10** — comment-only edits across 14 files. No code, no types, no behavior. The work is in verifying where each reference should now point, not in making the change.

## Goal

Source comments across `src/` send readers to files that no longer exist. Architecture principle 10 records this exact class of misdirection as having already burned the project once, and it costs a reader a failed search every time.

Three families:

- **`sandbox-profile.ts`** (8 comments) — the code lives in `src/sandbox/profile.ts` and `src/sandbox/paths.ts`, and which of the two is meant differs per comment. Four of them are in `src/sandbox/index.ts` and actually mean `paths.ts`, because they cite `dualParams`, `ENV_SCRUB_PATTERNS`, and `SECRET_DENY_PATHS` — all defined in the tables file, not the profile.
- **`sandbox.ts`** (13 comments) — the same defect in the same subsystem, not enumerated in the backlog entry but squarely inside its stated scope of "stale filename references in source comments across `src/`". The module is `src/sandbox/index.ts`.
- **Pre-flattening and pre-refactor paths** (5 comments) — `src/main.ts` cites `dist/server/main.js` and `src/server/main.ts`; `src/harness/index.ts` cites `src/server/controller.ts`; `src/browser/command.ts` attributes Playwright actions to `src/cli.tsx` and points at `src/connections.ts` and `src/db.ts` for the parsers it mirrors.

## Approach

Fix only the file references, leaving every comment's substance untouched. Within `src/sandbox/`, refer to siblings by bare filename (`profile.ts`, `paths.ts`, `index.ts`) — matching how those comments already read. From outside the directory, use the repo-relative path (`src/sandbox/index.ts`).

Each `sandbox-profile.ts` reference is resolved by what it actually cites, not by a blanket substitution:

| Site | Cites | Points to |
| --- | --- | --- |
| `sandbox/paths.ts` (2) | the Seatbelt profile, the deny-then-carve-in ordering | `profile.ts` |
| `sandbox/index.ts` (4) | `dualParams`, `ENV_SCRUB_PATTERNS`, `SECRET_DENY_PATHS` | `paths.ts` |
| `controller/shell.unsandboxed.test.ts` | the `signal` rule | `src/sandbox/profile.ts` |
| `workspace-repo-root.unsandboxed.test.ts` | TMPDIR nesting | `src/sandbox/profile.ts` |

The pre-flattening paths resolve to: `dist/main.js` / `src/main.ts` (the `outDir` is `dist`, so `src/main.ts` compiles to `dist/main.js`); `src/controller.ts`; `src/browser/index.ts` for the Playwright host; `src/connection/parsing.ts` for `parseConnectionCommand`; and `src/database/parsing.ts` for the `db` parser, which is named `parseDatabaseCommand`.

## Implementation steps

1. Repoint the four `sandbox-profile.ts` references in `src/sandbox/index.ts` at `paths.ts`.
2. Repoint the two `sandbox-profile.ts` references in `src/sandbox/paths.ts` at `profile.ts`.
3. Repoint the `sandbox-profile.ts` references in `src/controller/shell.unsandboxed.test.ts` and `src/workspace-repo-root.unsandboxed.test.ts` at `src/sandbox/profile.ts`.
4. Repoint every `sandbox.ts` reference at `src/sandbox/index.ts` (bare `index.ts` inside `src/sandbox/`): `src/workspace.ts` (3), `src/sandbox/profile.ts` (2), `src/sandbox/paths.ts` (3), `src/pty.ts`, `src/shell.ts`, `src/agent/types.ts`, `src/acp/types.ts`, `src/acp/index.ts`, `src/workspace-repo-root.unsandboxed.test.ts`.
5. Fix `src/main.ts` (`dist/main.js`, `src/main.ts`), `src/harness/index.ts` (`src/controller.ts`), and `src/browser/command.ts` (`src/connection/parsing.ts`, `src/database/parsing.ts` with the parser's real name, `src/browser/index.ts`).

## Tests

None, and none are possible. Every edit is inside a comment; the compiler erases all of it, so there is no behavior for a test to pin and no assertion that could distinguish before from after. `./scripts/run.mjs check-diff` runs after each step to confirm the tree stays green.

## Out of scope

- **The substance of any comment.** One discovered inaccuracy is left as-is deliberately: `src/controller/shell.unsandboxed.test.ts` says "there's no `(allow signal ...)` rule in sandbox-profile.ts, and default is deny", but `src/sandbox/profile.ts:179` now has `(allow signal (target children))`, whose own comment names "ShellManager killing the persistent shell it spawned for a tab" — the very case the test claims is denied. Whether that test still needs its `unsandboxed` exclusion is a behavior question that needs verification inside a real sandbox, not a comment fix. Only the filename is corrected here.
- `src/interactive.test.ts`, which uses `'vim src/cli.tsx'` as an arbitrary command-string fixture, not as a reference to a real file.
- Any reference in `web/src/`, `ai/`, `product/`, or `documentation/`.

## Documentation

None. Comments are invisible from outside the codebase — no command, flag, default, or user-visible behavior changes.
