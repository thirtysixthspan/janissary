# Bump the lockfile with the release and commit it alongside package.json

**Complexity: 3/10** — one script gains a second version-carrying file, and the write is extracted into a small module so it can be tested without running a release. No application source changes, no wire protocol, nothing a user of the app can observe. The only judgment call is how the lockfile is rewritten, and that is settled by the fact that the file already round-trips through `JSON.parse`/`JSON.stringify` byte-for-byte.

`scripts/release.mjs` writes the new version into `package.json` and stages exactly that file and `CHANGELOG.md`:

```js
run('git', ['add', PKG.pathname, CHANGELOG.pathname]);
run('git', ['commit', '-m', `feat(package): bump version to ${newVersion}`]);
run('git', ['tag', tag]);
```

`package-lock.json` carries the same version twice — once at its root and once in `packages[""]`, the entry describing the root package itself — and it is left at the old number. The tagged release commit is therefore internally inconsistent from the moment it is made: `npm ci` from that tag installs a tree whose lockfile disagrees with its manifest, and the next `npm install` anyone runs rewrites the two fields from `package.json` and leaves the drift sitting in their working tree as churn unrelated to whatever they were doing. Several of this project's own task playbooks already work around it by telling the agent to `git checkout -- package-lock.json` when an install dirties the file.

## Goal

A release prepared by `scripts/release.mjs <version> --for-real` puts the new version in `package.json` **and** `package-lock.json`, and the commit it makes contains both files along with `CHANGELOG.md`. A dry run still writes nothing and says which files it would have written.

## Design decisions

**Rewrite the lockfile by parsing it, not by patching its text.** `JSON.stringify(JSON.parse(text), null, 2) + '\n'` reproduces the committed `package-lock.json` byte-for-byte today (verified against the 365 KB file in the tree), and the same is true of `package.json` — which is why `updatePackageJson` already does exactly that. Parsing means the two version fields are addressed by name rather than by counting occurrences of `"version":`, of which the lockfile has thousands.

**Do not shell out to npm.** `npm install --package-lock-only` would also sync the file, but it re-resolves the dependency graph against the registry: it needs the network, it can pull in newer transitive versions, and a release is the last moment to be changing what ships. Setting two fields is what the version bump means; nothing else about the lockfile should move.

**Both version fields, and the second one only when it exists.** A `lockfileVersion: 3` file has `packages[""]`, which repeats the root package's `name` and `version`. Older or hand-trimmed files may not, so the root-package write is guarded rather than assumed — a lockfile without that entry still gets its top-level `version` set.

**The list of files written is the list of files staged.** The extracted writer returns the paths it wrote, and `git add` is given that return value rather than a second, separately maintained list. A third version-carrying file added later cannot then be written but left unstaged.

**Extract the write, keep the orchestration.** `release.mjs` runs its work at import time — it validates the branch, prompts, commits and tags as top-level statements — so nothing in it can be imported by a test. Moving the file-writing into `scripts/release/version-files.mjs` makes the part worth testing importable and leaves the release choreography where it is. This mirrors `scripts/docs-screenshots/`, where the runner is a thin `.mjs` at the top of `scripts/` and its pieces live in a sibling directory with colocated tests. `scripts/run.mjs` resolves `${name}.mjs` before a bare `${name}`, so `./scripts/run.mjs release` keeps running `release.mjs` and not the new directory.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Version read, dry-run branch, confirm prompt, commit and tag | `scripts/release.mjs` (kept) |
| The `JSON.stringify(..., null, 2) + '\n'` write shape | `scripts/release.mjs`'s `updatePackageJson` (moves into the new module) |
| Runner-at-top / modules-in-a-sibling-directory layout with colocated `.test.mjs` | `scripts/docs-screenshots/` |
| `scripts/**/*.test.mjs` in the `server` vitest project | `vitest.config.ts` |
| `scripts/` changes trigger `test:server` | `scripts/check-diff.mjs` |

## Implementation steps

1. **New module `scripts/release/version-files.mjs`.** Exports:
   - `VERSION_FILES` — `['package.json', 'package-lock.json']`, in the order they are written and staged.
   - `bumpVersion(text, version)` — parses the JSON text, sets `version` at the root, sets `packages[''].version` when that entry exists, and returns the re-serialized text with a trailing newline.
   - `writeVersionFiles(root, version)` — resolves each name against `root`, fails with `missing <name>` if one is absent, writes each through `bumpVersion`, and returns the absolute paths written.

2. **`scripts/release.mjs`: write and stage both files.** Replace `updatePackageJson` with an `updateVersionFiles(version)` that logs each file it would write on a dry run and returns `[]`, and otherwise calls `writeVersionFiles(ROOT, version)`, logs `Updated <name> to <version>` per path, and returns them. `ROOT` comes from `fileURLToPath(new URL('..', import.meta.url))`. Pass the returned paths to `git add` ahead of `CHANGELOG.pathname`. The `PKG` URL stays — the current version is still read through it.

## Tests

`scripts/release/version-files.test.mjs` — new file, vitest, matching the plain `describe`/`it`/`expect` style of `scripts/docs-screenshots/reset.test.mjs`:

- `bumpVersion` sets the version of a manifest and leaves its other fields alone.
- `bumpVersion` sets both the lockfile's root version and its `packages[""]` version.
- `bumpVersion` leaves a lockfile with no `packages[""]` entry otherwise untouched, setting only its root version.
- `bumpVersion` emits two-space indentation and a trailing newline, so the file it writes is the file npm would.
- `writeVersionFiles` writes the new version into both files in a temp directory.
- `writeVersionFiles` returns both paths, in `VERSION_FILES` order — this is what the release commit stages.
- `writeVersionFiles` fails naming the missing file, and does so before writing anything.

## Spec and documentation

- `product/specs/release.md` — new. There is no spec for release preparation today; this adds a short one covering what a release run writes, what its commit contains, and what a dry run does instead.
- `documentation/developer-documentation/release-process.md` — its numbered "What it does" list says "Bumps the version in `package.json`", which this change makes wrong. It names both files instead, and the commit step says which files the commit carries.

## Out of scope

- **`scripts/publish.mjs`.** It reads the version and pushes a tag; nothing it does depends on the lockfile.
- **Re-resolving the dependency graph.** A version bump moves two fields. Anything that changes which packages the lockfile pins belongs to the `ai/tasks/hygiene/update-package*.md` playbooks.
- **Backfilling past releases.** Tags already cut carry the drift; rewriting them is not worth it and this change does not attempt it.
- **The task playbooks that tell agents to revert an install's lockfile churn.** With releases in sync that churn should stop appearing, but the instruction is harmless and removing it needs a release cut to confirm.
