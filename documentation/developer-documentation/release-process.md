# Release process

## Overview

A release is a two-step process:

1. **`scripts/release.mjs`** — bumps version, generates changelog, commits, tags, runs checks and build
2. **`scripts/publish.mjs`** — publishes to npm, pushes the tag, creates a GitHub Release

Both scripts default to dry-run. Pass `--for-real` to execute.

## Prerequisites

- npm account with publish access to the `janissary` package
- Logged in locally (`npm whoami` should show your account)
- [`gh` CLI](https://cli.github.com/) installed and authenticated
- On the `master`/`main` branch with a clean working tree

## Step 1: Prepare the release

```bash
node scripts/release.mjs patch       # dry-run: 0.5.0 -> 0.5.1
node scripts/release.mjs minor       # dry-run: 0.5.0 -> 0.6.0
node scripts/release.mjs major       # dry-run: 0.5.0 -> 1.0.0
node scripts/release.mjs 0.6.0       # dry-run: explicit version
node scripts/release.mjs patch --for-real   # execute
```

The release level (`patch`, `minor`, `major`) follows [Semantic Versioning](https://semver.org/). You can also specify an explicit semver.

What it does:

1. Validates the working tree is clean and you're on `master`/`main`
2. Pulls latest from remote (`git pull --rebase`)
3. Generates the changelog section from conventional commits since the last tag, categorized by type (Features, Bug Fixes, Documentation, Refactoring, Chores, Breaking Changes)
4. Updates `CHANGELOG.md` with the new version entry
5. Bumps the version in `package.json`
6. Commits the version bump (`feat(package): bump version to X.Y.Z`)
7. Tags the commit (`vX.Y.Z`)
8. Runs typecheck, the full test suite, and build

After completion, it prints the command to run for step 2.

## Step 2: Publish

```bash
node scripts/publish.mjs              # dry-run
node scripts/publish.mjs --for-real   # actually publish
```

What it does:

1. Verifies the tag exists locally (created in step 1)
2. Publishes to npm
3. Pushes the commit and tag to GitHub
4. Creates a GitHub Release with auto-generated release notes

## Full workflow

```bash
# 1. Prepare
git checkout master
git status                              # confirm clean
node scripts/release.mjs patch          # dry-run to preview
node scripts/release.mjs patch --for-real

# 2. Publish
node scripts/publish.mjs --for-real
```

## Changelog

The changelog follows [Keep a Changelog](https://keepachangelog.com/) and is maintained automatically by the release script. Each version section is generated from conventional commits and categorized by type.

The initial `CHANGELOG.md` was seeded manually with a summary of pre-release development. All subsequent entries are produced by the release script.

## Verifying

After publishing, install the package and check the version:

```bash
npm install -g janissary
janus --version
```

The GitHub Release will be visible at `https://github.com/thirtysixthspan/janissary/releases`.
