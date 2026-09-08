# Release preparation

### Preparing a release

`node scripts/release.mjs <patch|minor|major|version> [--for-real]` prepares a release: it works out the new version, writes the changelog section, bumps the version-carrying files, and makes one commit and one tag. Publishing is a separate step (`scripts/publish.mjs`), and the two are deliberately split so a prepared release can be inspected before it leaves the machine.

Invoked with no argument it prints its usage and exits zero:

```
Usage: node scripts/release.mjs <patch|minor|major|version> [--for-real]
```

A `patch`, `minor` or `major` argument increments that component of the current version and zeroes the ones below it; an explicit `x.y.z` is taken as-is. Anything else stops the run:

```
fatal: expected patch|minor|major or semver (e.g. 1.2.3), got "<argument>".
```

Every run is a dry run unless `--for-real` is passed.

### What the release commit contains

`--for-real` writes three files and commits exactly those three:

- `CHANGELOG.md` gains a `## [<version>] - <date>` section built from the conventional-commit subjects since the last tag, grouped into Breaking Changes, Features, Bug Fixes, Documentation, Refactoring, Chores and Other. Two kinds of commit are left out of it, of every group including Breaking Changes: earlier version bumps, and the `sync: <filename>` commits made when a synced file is saved from an editor tab. Neither reports a change to the product, and between two tags the sync commits outnumber the ones that do. A group left with nothing in it prints no heading — a release whose only uncategorized commits were sync commits has no Other section at all.
- `package.json` gets the new version.
- `package-lock.json` gets the new version in both places it carries one — at its root, and in the `packages[""]` entry describing the root package itself. A lockfile with no such entry has only its root version set.

Both JSON files are rewritten by parsing them and re-serializing with two-space indentation and a trailing newline, which is the shape npm itself writes, so the diff is the version lines and nothing else. Nothing in the lockfile's dependency graph is re-resolved: a version bump moves the package's own version and leaves what it pins alone.

The manifest and the lockfile move together because a commit that bumped only the manifest would be internally inconsistent from the moment it was tagged — `npm ci` at that tag would install against a lockfile that disagrees with it, and the next `npm install` anyone ran would rewrite the two fields and leave the drift in their working tree.

The commit's subject is `feat(package): bump version to <version>` and it is tagged `v<version>`. `npm run build` runs after the tag. The run then prints the publish command to follow it with.

### Dry runs

Without `--for-real` nothing is written, committed or tagged. The run prints the changelog section it would add between `── CHANGELOG.md preview ──` markers, names the files it would bump —

```
Version <current> -> <new> in package.json, package-lock.json (dry-run, not saved)
```

— and reports the commit subject and tag it would create. It also does not pull from the remote, so a dry run leaves the repository exactly as it found it.

### Refusals

A release is only prepared from a clean tree on the primary branch, and either condition failing stops the run before anything is written:

```
fatal: working tree has uncommitted changes.
fatal: releases must be cut from master/main (on <branch>).
```

A version-carrying file that is not there stops the run the same way, with `missing <name>`, and it is found before any file is written — so a release never leaves the version bumped in one file and not the other.
