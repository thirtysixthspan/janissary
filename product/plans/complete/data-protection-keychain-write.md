# Allow the sandbox to persist a refreshed OAuth token to the data-protection keychain

**Complexity: 4/10** — a one-clause addition to the Seatbelt profile, but the root cause is subtle (which of two macOS keychain databases the refreshed token lands in) and the regression test needs a fake-`$HOME` relocation to exercise the real `sandbox-exec` profile without touching the machine's real keychain.

## Root cause

A workspaced harness (`claude -w` / `harness -w`) runs under the Seatbelt sandbox (`src/sandbox/profile.ts`). When a harness's OAuth access token expires mid-session it refreshes the token over the network and persists the new one back into the macOS Keychain. Persisting is a *write* to a keychain database file; every such write is denied by the profile's top-level `(deny default)` unless a carve-out matches.

A prior fix (`HOME_WRITE_PREFIX_CARVEOUTS` in `src/sandbox/paths.ts`) carved in writes to the **file-based login keychain**, `~/Library/Keychains/login.keychain-db`, and its atomic-write/SQLite siblings. That resolved the reported failure at the time and the bug was closed. It has since been **re-filed**: on current macOS, Keychain Services persists a generic-password item (which is how an OAuth harness stores its credential) into the **data-protection keychain**, whose database lives at `~/Library/Keychains/<UUID>/keychain-2.db` — a different file the login-keychain carve-out does not cover. That write hits the deny-default and silently fails, so the harness keeps sending the stale expired token and the provider returns `401 Invalid authentication credentials`, surfaced by the harness as **"Please run /login"**. The inline comment on `HOME_WRITE_PREFIX_CARVEOUTS` already anticipated exactly this: "If a data-protection keychain (`<UUID>/keychain-2.db`) is ever in play, its own write deny will surface separately in the log."

## Correct behavior

A sandboxed workspaced harness can persist a refreshed OAuth credential to the data-protection keychain, so an extended session recovers from an expired access token silently — exactly as it already can for the file-based login keychain — without ever prompting to re-login. The carve-out stays narrow: only keychain-database-shaped files under a single `~/Library/Keychains` subdirectory become writable, never the whole subtree.

## Reproduction

The failure is a live-`sandbox-exec` behavior, so it is reproduced by running the real profile and observing the write being denied. Because the credential store lives under the real `~/Library/Keychains`, which must never be touched by a test, the reproduction takes the shipped profile + `-D` params from `sandboxSpawn` and relocates every occurrence of the real home path to a throwaway temp dir, then points the sandboxed process's `HOME` there. The profile's Keychain rules are all home-relative, so this faithfully exercises them.

Against the unfixed profile, a write to `<fakeHome>/Library/Keychains/<uuid>/keychain-2.db` (and its `-wal`/`.sb-<rand>` siblings) is **DENIED**, while `login.keychain-db` writes are allowed — confirming the gap. This is encoded as the regression test below; run without the fix, its data-protection-keychain assertion fails (`expected false to be true`).

## Approach

Add one HOME-anchored `regex` write-allow clause to the `(allow file-write*)` block in `src/sandbox/profile.ts`. The `<UUID>` directory is per-machine and unknown ahead of time, so no fixed `prefix`/`subpath` `-D` param can name it — the narrowest expressible match is `(require-all (subpath (param "HOME")) (regex #"/Library/Keychains/[^/]+/keychain-2\.db"))`, the same `require-all (subpath HOME) (regex …)` shape the existing `package.json`/`tsconfig.json` read carve-in already uses. The unanchored tail also matches the atomic-write temp sibling (`keychain-2.db.sb-<random>`) and the SQLite sidecars (`-wal`/`-shm`/`-journal`), mirroring how the `login.keychain-db` prefix covers its own siblings.

This is placed in `profile.ts` rather than the table-driven lists in `paths.ts` for two reasons: the variable `<UUID>` component can't be expressed as a fixed home-relative path param, and `paths.ts` is already at 195 lines against the 200-line `max-lines` limit, so a new param mechanism would push it over.

## Implementation

1. **`src/sandbox/profile.ts`** — add a `keychainWriteClause` constant (a `require-all` of `(subpath (param "HOME"))` and the `/Library/Keychains/[^/]+/keychain-2\.db` regex), documented with a comment explaining the data-protection keychain and why a regex (not a param) is required. Interpolate it into the `(allow file-write*)` block immediately after `${writePrefixClauses}`.

No change to `src/sandbox/paths.ts` or `src/sandbox/index.ts` — the clause needs no new `-D` param (it reuses the existing `HOME` param).

## Regression test

`src/sandbox/keychain.sandbox.test.ts` (new; the `.sandbox.test.ts` suffix runs only under `npm run test:sandbox` on the host — `sandbox-exec` cannot nest inside an already-sandboxed workspace, so these are excluded from `npm test`/`check-diff`, same as the existing `live.sandbox.test.ts`):

- `allows persisting a refreshed credential to the data-protection keychain (keychain-2.db)` — writes to `<uuid>/keychain-2.db` and its `.sb-<rand>`/`-wal` siblings are allowed. **Fails without the fix** (the reproduction above), passes with it.
- `still allows the login keychain write (login.keychain-db)` — guards the prior fix against regression.
- `keeps the carve-out narrow: non-keychain files under ~/Library/Keychains stay denied` — a `metadata.plist` under the UUID dir and an `other.db` under `Keychains/` stay denied, proving the regex isn't over-broad.

All three use the fake-`$HOME` relocation described under Reproduction, so no real keychain file is read or written.

## Out of scope

- The file-based **login keychain** carve-out (`HOME_WRITE_PREFIX_CARVEOUTS`) — already present and still needed (some harnesses/older macOS use it); left unchanged.
- Broadening writes to the whole `~/Library/Keychains` subtree — deliberately avoided; only keychain-DB-shaped files become writable.
- The read side of `~/Library/Keychains` (`HOME_READ_CARVEINS`) — reads already work; only the refreshed-token *write* was failing.

## Verification

- `npm run test:sandbox -- src/sandbox/keychain.sandbox.test.ts` — all three tests pass with the fix; the data-protection assertion fails without it (verified by stashing the profile change).
- `./scripts/run.mjs check-diff` — lint/typecheck clean. Note: `check-diff` does not execute the regression test (it lives in the `sandbox` vitest project, excluded from the server/client projects because `sandbox-exec` can't nest inside a sandboxed workspace); the test is run explicitly on the host via `test:sandbox`.
- A fully end-to-end reproduction (an actual expired OAuth token in a live workspaced harness hitting a real provider 401) is not possible in this unattended environment; the live `sandbox-exec` behavior — the actual deny/allow of the keychain write — is exercised directly by the regression test.
