# File read: deny secret locations under the home directory, wherever the root sits

**Complexity: 3/10** — ~20 added lines in one file, 5 requirements, 6 test scenarios (p=4.54)

Fixes the PR 1992 review finding against subplan 3 (`product/plans/complete/move-janissarys-acp-tool-loop-3-file-read-reader.md`): the workspace reader matches `.env` and `SECRET_DENY_PATHS` only against path segments relative to the root. When the root is itself a secret directory, or splits a multi-segment entry — a project opened at `~/.config`, `~/.ssh`, `~/.aws`, or `~/.local/share` — `gh/hosts.yml`, `id_rsa`, `credentials`, and `opencode/auth.json` read normally, although the Seatbelt profile built from the same table denies them to a sandboxed agent. The reader runs unsandboxed on that agent's behalf, so it must not be weaker than that deny.

## Goal

A file whose real location is one the Seatbelt secret deny covers reports `Secret file: <path>.`, whatever root it was reached through. Ordinary files keep reading, including files under a root whose ancestor directory merely shares a name with a table entry somewhere the sandbox does not deny.

## Decision: anchor the absolute check at the home directory, as Seatbelt does

The review's proposal suggested matching a `SECRET_DENY_PATHS` run anywhere among the segments of the file's real absolute path. That is broader than the sandbox. `homeDParams` in `src/sandbox/harness-spawn.ts` binds every entry to `path.join(home, entry)` with `home = resolvePath(homedir())`, plus that path's realpath-resolved form, and the profile denies each as a Seatbelt `subpath`. So the sandbox denies `~/.ssh/id_rsa` but not `/work/.ssh/proj/README.md` or `~/code/.docker/app/main.ts`. A floating match would refuse every file of a project that merely lives under a directory such as `.docker`, `.kube`, or `.terraform.d` outside the home-anchored location, which the sandbox lets the agent read anyway.

The new check therefore mirrors the deny exactly: for each entry it builds the literal location `<real home>/<entry>` and that location's realpath (which differs when a dotfile manager makes `~/.config` a symlink), and the file is secret when its real path lies at or under either, compared case-insensitively like the existing rule. The existing root-relative checks stay as they are — they still catch a `.ssh` or `.env` anywhere inside the root and keep a missing secret reporting `Secret file` before any disk access, preserving the subplan's check order. The `.env` last-segment rule needs no absolute form: the file's last segment is always inside the root, so the root-relative check already sees it.

The home directory is `os.homedir()` of the host running the reader, which is the host owning the root (local or far side) — the same host whose sandbox would apply. This adds `node:os` to the reader's import list; it is a built-in with no side effects on import, so the far side's import stays side-effect free.

## Implementation steps

1. In `src/file-read/read.ts`, import `homedir` from `node:os`, and add a private `resolveOrSelf(p)` (realpath, falling back to the input when it does not exist, as `resolvePath` in `src/sandbox/resolve.ts` does — not imported, because that module also pulls in `node:child_process`) and a private `isUnderHomeSecret(realFile)` that computes the real home, builds the literal and resolved location of every `SECRET_DENY_PATHS` entry, lowercases both sides, and answers whether `containedAbsolute(location, realFile)` holds for any of them. A short comment says why it exists: the reader runs outside the sandbox, so it must deny what the Seatbelt rule built from the same table denies, anchored the same way.
2. In `loadBytes`, right after the existing real-path secret check, return `'Secret file'` when `isUnderHomeSecret(realFile)` is true.
3. Leave subplan 3's plan untouched; it is a completed record.

## Tests

In `src/file-read/read.test.ts`, a new `describe` block stubs `HOME` to a temp directory with `vi.stubEnv` (which `os.homedir()` honors on POSIX) and restores it afterwards:

- root `<home>/.config`, reading `gh/hosts.yml` → `Secret file: gh/hosts.yml.`;
- root `<home>/.ssh`, reading `id_rsa` → `Secret file: id_rsa.`;
- root `<home>/.local/share`, reading `opencode/auth.json` → `Secret file: opencode/auth.json.`;
- root `<home>/.config`, reading `other.txt` → read normally, so a dotfiles project is not refused wholesale;
- root `<outside>/.ssh/proj` (a `.ssh` ancestor not under the home), reading `a.txt` → read normally, since the sandbox does not deny it either;
- `<home>/.config` as a symlink to `<outside>/dotfiles/config`, root `<outside>/dotfiles/config`, reading `gh/hosts.yml` → `Secret file: gh/hosts.yml.` (the resolved form of the deny location).

All existing tests keep passing unchanged.

## Spec

None. `product/specs/` has no spec for the `file read` reader yet, because nothing user-visible ships until subplan 5 registers the typed command.

## Out of scope

Secrets under names the table does not list. The stat-to-read race (subplan 3 defers it). Narrowing the existing root-relative rule to match the sandbox — it is deliberately broader inside the root.
