# Disable Claude commit attribution

**Complexity: 1/10** — a single-key addition to a static JSON config file, no application code involved.

## Goal

Claude Code appends a `Co-Authored-By: Claude` trailer to commits it makes in this repo by default. Disable that trailer by setting the `attribution.commit` key to an empty string in the project's `.claude/settings.json`. PR-description attribution (`attribution.pr`) is untouched — only commit attribution was asked for.

## Approach

`.claude/settings.json` (repo root) is the project-level settings file Claude Code reads when running in this repo. It's also the exact file `installConfigDirectory` (`src/project-init.ts:27-39`) copies byte-for-byte into every project scaffolded by `janus init` (`src/project-init.ts:55-60`), so editing it here also becomes the new default for every future `janus init`.

Claude Code's `attribution.commit` setting is the current, non-deprecated replacement for the legacy `includeCoAuthoredBy` boolean; unlike that boolean, it controls commit-trailer text independently of PR-description text. Setting it to `""` suppresses the commit trailer entirely.

No application code in this repository reads or acts on this key — it's consumed entirely by the external `claude` binary — so there is no code path here to change or unit test.

## Implementation steps

1. `.claude/settings.json`: add a top-level `"attribution": { "commit": "" }` key.
2. Run `./scripts/run.mjs check-diff`.

## Tests

None required — this is a plain data/config change consumed by the external Claude Code CLI, not by any code path in this repository. `src/project-init.test.ts` (lines 71-72) already asserts byte-for-byte equality between the scaffolded copy and this file's live contents at test time, so it exercises the new content automatically without needing changes.

## Spec

`product/specs/cli.md` — add one sentence to the `janus init` paragraph noting the standard Claude configuration disables commit attribution text, mirroring the existing callout for codex's `GH_TOKEN`/`GITHUB_TOKEN` environment policy.

## Docs

None needed — `help.md` and `documentation/user-documentation/` describe `janus init` installing `.claude/settings.json` but don't itemize or document its attribution default, so there's nothing to correct.

## Out of scope

- PR-description attribution (`attribution.pr`) — only commit attribution was requested.
- The deprecated `includeCoAuthoredBy` boolean — superseded by `attribution`.
- The application's own `.janissary/config.json` runtime settings (`src/config.ts`) — an unrelated settings system with no attribution concept; the work item, after clarification, refers to Claude Code's own `.claude/settings.json`, not this app's config.
