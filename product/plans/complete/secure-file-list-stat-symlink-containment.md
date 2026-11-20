# secure file list and file stat symlink containment

**Complexity: 4/10** — ~35 added lines across 4 production files, 6 requirements and 6 symlink-escape scenarios, 2 new helpers (p=5.16).

The local `file list` and `file stat` cores check only the requested path lexically before asking the filesystem port for entries and stats. Every other local file command resolves the real target and refuses one that leaves the workspace or lands on a secret path, and the far-side filesystem refuses a path that is not physically contained. This change closes that gap: a local symlink inside the workspace that points to a directory, a file, or a home-secret location outside it can no longer be listed or described. The answer stays the one-word `forbidden`, the same word the far-side physical-containment gate already produces for these operations, so local and remote keep agreeing.

## Approach

- Add one shared helper to `src/file-read/policy.ts` that resolves a requested path's real target the way `resolveRealTarget` in `src/file-exists/exists-core.ts` does: canonicalize the root and the target, and for an absent target canonicalize its nearest existing ancestor so an escaping symlink cannot hide behind a missing leaf. It returns a reusable checker built on `createRealTargetCheck`, so a directory listing resolves home-secret anchors once instead of once per entry.
- Route `src/file-exists/exists-core.ts` through the same helper, dropping its private resolver and absent-path test, so all three read-only command cores consult one containment rule. Its answers are unchanged.
- In `src/file-list/list-core.ts`, after `checkLexicalPath`, refuse the requested directory when the real-target check fails. Filter each listed entry through the same checker before rendering its row, keeping the existing secret-name filter and vanished-entry zero-stat fallback.
- In `src/file-stat/stat-core.ts`, after `checkLexicalPath`, refuse the requested path on a real-target failure before `port.statRows`.
- Keep wording on the existing `fileFailureLine` mapping, which answers `forbidden` for both `Outside the workspace` and `Secret file`, with no path echoed.

## Implementation steps

1. Extend `src/file-read/policy.ts` with `createRequestedTargetCheck(root)`, which captures the canonical root and a `createRealTargetCheck` checker, plus a small absent-path error test; for an absent target it checks the nearest existing ancestor. Add a one-line comment on why the nearest existing ancestor is resolved (non-obvious security why).
2. Replace `resolveRealTarget`, its local `resolveExisting`, and its `isAbsentPathError` in `src/file-exists/exists-core.ts` with a call to `createRequestedTargetCheck(root)(requested)`; keep `fileFailureLine` mapping and `readRowStat` behavior as they are.
3. In `src/file-list/list-core.ts`, call the checker on the requested path after the lexical check and return `forbidden` on failure; add the same check per entry to the `visible` filter before paths and stats are computed.
4. In `src/file-stat/stat-core.ts`, call the checker on the requested path after the lexical check and return `forbidden` on failure before `port.statRows`.

## Tests

- `src/file-list/tab-list.test.ts`: local cases for a symlink to an outside directory (listed as the target), a symlink to an outside file, and a symlink to a home-secret path (with `HOME` stubbed to a temporary home holding `.ssh`), each expecting `forbidden`; keep the existing local-versus-remote row-parity case and the secret-name-filter, empty-directory, and vanished-entry cases passing.
- `src/file-stat/tab-stat.test.ts`: the same three local symlink-escape cases expecting `forbidden`; keep the existing local-versus-remote row-parity case passing.

## Specs and docs

- Add `product/specs/file-list-stat.md`, describing the one-word refusals and that both commands refuse a path whose real location leaves the workspace or is secret, including a symlink inside the workspace, and that `file list` omits an entry whose resolved target is outside or secret. Mirror the `file-exists` spec's plain behavioral prose with no implementation detail.
- No help or user-documentation edit: these already describe `forbidden` for outside and secret paths without promising symlink behavior, and no flag, default, or command shape changed.

## Out of scope

- No change to the remote implementations, protocol, or `rejectionLine`; the far side already gates physical containment and already answers `forbidden`.
- No change to `file exists`, `file read`, `file glob`, `file grep`, `file head`, or `file tail` behavior; the `exists-core` edit is a behavior-preserving move to the shared helper only.
- No new command, flag, setting, row format, or one-word answer; `forbidden` is reused as-is.
- No change to the other two pull-request backlog entries or to the PR description.

## Verification

- `$janissary/scripts/run.mjs check-diff` clean after the source changes and again after the tests.
- The new local symlink-escape cases pass, and the existing local-versus-remote parity assertions in both test files still pass.
