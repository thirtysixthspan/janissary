# Allow the sandbox to read opencode's cached model list

**Complexity: 2/10** — a one-entry addition to the read carve-in table in `src/sandbox/paths.ts`, which that table's own comment already describes as the intended extension point ("Extending any restriction is a one-line table change here"). No new param mechanism, no profile-text change, no new module. The only judgment calls are read-only vs. read+write (settled below) and which of the two existing sandbox test surfaces each assertion belongs on.

## Root cause

A workspaced harness (`harness opencode -w`) runs under the Seatbelt sandbox (`src/sandbox/profile.ts`). The profile allows reads everywhere by default, then denies `$HOME`'s *contents* (`(deny file-read-data file-read-xattr (subpath (param "HOME")))`), then carves specific paths back in from the `HOME_READ_CARVEINS` table in `src/sandbox/paths.ts`.

`~/.cache/opencode/models.json` — where opencode caches the provider/model catalog it has fetched — is not in that table, and is not covered by any other carve-in: the `.cache` entries that exist (`.cache/pip`, `.cache/yarn`, both in `HOME_WRITE_CARVEOUTS` and therefore also read carve-ins) are unrelated subdirectories, and the comment on `HOME_WRITE_CARVEOUTS` deliberately rules out carving in the whole `~/.cache`. So the read lands on the `$HOME`-wide content deny and fails with `EPERM`, and a sandboxed opencode cannot see the cached model list the unsandboxed one on the same machine has already populated.

## Correct behavior

A sandboxed workspaced process can read `~/.cache/opencode/models.json`, so a workspaced opencode harness sees the same up-to-date model catalog it would outside a workspace. The carve-in stays narrow: that one file becomes readable, not the `~/.cache/opencode` directory's other contents and not the rest of `~/.cache`.

## Approach

Add `'.cache/opencode/models.json'` to the read-only extras portion of `HOME_READ_CARVEINS` in `src/sandbox/paths.ts` — the segment after the `...HOME_WRITE_CARVEOUTS` spread, alongside the other read-but-not-write entries (`.claude/settings.json`, `.gitconfig`, `.config/gh/config.yml`, …).

This needs no other change. `HOME_READ_CARVEINS` is already wired end to end: `READ_CARVEIN_PARAMS` derives its param names from the array's length (`dualParams('R', HOME_READ_CARVEINS.length)`), `homeDParams` in `src/sandbox/index.ts` binds each entry to a literal and a realpath-resolved `-D` param, and `readCarveClauses` in `src/sandbox/profile.ts` emits a `(subpath (param …))` clause per param into the read-allow block. Adding a string to the array propagates through all three automatically.

Three specifics worth stating, since each was a real choice:

- **A file entry, not a directory entry.** Existing table entries include plain files (`.claude/history.jsonl`, `.claude.json`, `.claude/settings.json`, `.gitconfig`, `.npmrc`, `.config/gh/config.yml`), so `subpath` on a file path is established convention here — for a regular file it matches only that file, since nothing nests under it.
- **Read-only, not also writable.** The issue asks for reading. Making the cache writable would let a sandboxed agent rewrite a model catalog that the *unsandboxed* opencode on the same machine later consumes — the exact hazard the comment on `HOME_WRITE_CARVEOUTS` cites for refusing to carve in whole cache trees ("broad cache write access would let a sandboxed agent poison packages/plugins that other, non-sandboxed processes later consume"). Reading satisfies the stated goal on its own; see Out of scope.
- **No `HOME_READ_LISTING_DIRS` entry.** That table exists for directories whose *node* must be listable (`opendir`/`readdir`), which is a distinct Seatbelt operation — `.claude` is there because a settings read-modify-write enumerates the directory first. Opening a known file path needs no listing of its parent: only `file-read-metadata` on the ancestors, which the profile already allows across all of `$HOME`. Nothing in the issue describes opencode enumerating that directory, so no listing entry is added.

## Implementation

1. **`src/sandbox/paths.ts`** — add `'.cache/opencode/models.json'` to `HOME_READ_CARVEINS`, and extend that table's existing doc comment with a sentence naming the entry and why it is read-only (a cache an unsandboxed opencode also reads, so a sandboxed process must not be able to rewrite it).

No change to `src/sandbox/profile.ts` or `src/sandbox/index.ts`.

## Tests

Two surfaces, matching how the existing sandbox tests are split:

- **`src/sandbox/index.test.ts`** (runs in `check-diff`) — one case asserting the carve-in reaches the spawn: the `-D` param values for a workspaced `sandboxSpawn` include `<home>/.cache/opencode/models.json`, and do **not** include the bare `<home>/.cache` or `<home>/.cache/opencode` directory (proving the carve-in stayed narrow rather than widening the cache tree). Mirrors the existing `binds a secret-deny param to opencode's credential file without denying its directory` case, which asserts on `-D` values the same way.
- **`src/sandbox/opencode-models.sandbox.test.ts`** (new; the `.sandbox.test.ts` suffix runs only under `npm run test:sandbox` on the host — `sandbox-exec` cannot nest inside an already-sandboxed workspace, so it is excluded from `npm test`/`check-diff`, same as `live.sandbox.test.ts` and `keychain.sandbox.test.ts`) — live-profile assertions using the **fake-`$HOME` relocation** pattern `keychain.sandbox.test.ts` establishes (take the profile + `-D` params from `sandboxSpawn`, rewrite every occurrence of the real home path to a throwaway temp dir, point the sandboxed process's `HOME` there). This keeps the test from reading or writing anything under the machine's real `~/.cache`:
  - `allows reading the cached opencode model list` — a `models.json` under `<fakeHome>/.cache/opencode/` is readable. Fails without the fix.
  - `keeps the carve-in narrow: other files under ~/.cache/opencode stay denied` — a sibling file in the same directory stays denied, proving the entry didn't widen into the directory.
  - `does not make the cached model list writable` — a write to that same `models.json` is denied, encoding the read-only decision above so a later widening to a write carve-out has to be deliberate.

  The shared `run` helper **re-throws a `sandbox_apply` failure** instead of reporting it as a denial. This was added after observing the failure mode directly: run from inside a workspace, `sandbox-exec` cannot nest, every invocation fails before the profile applies, and a helper that collapsed that into `false` made both deny-expecting cases above pass while proving nothing (only the one allow-expecting case failed, and with a misleading `expected false to be true`). Re-throwing turns that into an explicit "run this on the host, not inside a workspace" error on all three. Same hazard `live.sandbox.test.ts` guards with its `expect(stderr).not.toContain('sandbox_apply')` assertion.

## Spec

`product/specs/sandbox.md` § Filesystem policy — add the new path to the **Reads** bullet's `HOME_READ_CARVEINS` list, noting it is read-only (a cache a non-sandboxed opencode also consumes).

## Out of scope

- **Write access to `~/.cache/opencode/models.json`**, or to any other part of `~/.cache/opencode`. Read-only by decision (see Approach); a sandboxed opencode that wants a fresher catalog than the cache holds can fetch it over the network, which the default profile already allows.
- **Carving in the whole `~/.cache` or `~/.cache/opencode` subtree** — deliberately avoided; only the one named file becomes readable.
- **Updating the bundled `harness-models.json` catalog** — a separate `## ready` issue about janissary's own model list, unrelated to what a sandboxed opencode can read from its own cache.
- **Any other harness's model cache** — only the path the issue names is added.

## Verification

- `./scripts/run.mjs check-diff` — lint, typecheck, and the `index.test.ts` case all pass.
- The `index.test.ts` case was confirmed to **fail without the fix** (`paths.ts` change stashed: `AssertionError: expected [ …(200) ] to include '/Users/…/.cache/opencode/models.json'`), so it genuinely covers the carve-in rather than passing vacuously.
- The `-D` param binding was confirmed directly: for a workspaced spawn, `RL41`/`RR41` bind to the literal and realpath-resolved `~/.cache/opencode/models.json`, which is what the profile's read-allow block consumes.
- `npm run test:sandbox -- src/sandbox/opencode-models.sandbox.test.ts` — **not runnable from inside this workspace**, and this was verified rather than assumed: all three cases fail with `sandbox-exec: sandbox_apply: Operation not permitted`, because `sandbox-exec` cannot nest inside an already-sandboxed process. It has to be run on the host. (`check-diff` never executes it either — it lives in the `sandbox` vitest project, excluded from the server/client projects for exactly this reason.)
- End-to-end confirmation that a real workspaced `harness opencode -w` now lists the newest models is not reproducible in this unattended environment (it needs a real opencode login and a populated host cache, and the live profile cannot be applied from in here at all). The unit test plus the confirmed param binding are what cover the fix automatically; the live carve-in assertions are available to run on the host.
