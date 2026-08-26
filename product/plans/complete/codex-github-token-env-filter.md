# Keep the GitHub token visible to codex

**Complexity: 2/10** — one added section in the shipped `.codex/config.toml` template, one test pinning it, and spec/documentation updates. No source changes.

Janissary hands a workspaced tab a narrowly-scoped GitHub token by injecting `GH_TOKEN` (and `GH_CONFIG_DIR`) into the sandboxed process environment after `scrubEnv` runs — `src/sandbox/index.ts:219-226`, described in `product/specs/sandbox.md`'s "Environment scrubbing" and `product/specs/workspaced-agent.md`'s "GitHub authentication". That works for a `claude` harness, which passes its own environment through to the commands it runs.

It does not work for a `codex` harness. Codex filters the environment it hands to every command it executes through its `shell_environment_policy`, and that policy's default exclusion set drops any variable whose name looks credential-shaped — `*KEY*`, `*SECRET*`, `*TOKEN*`. `GH_TOKEN` matches, so it is stripped before `git push` or `gh` ever sees it, and the token Janissary went to some trouble to provide is invisible to exactly the commands that need it. The symptom is the same as having no token at all: pushes and `gh pr create`/`gh pr merge` fail from inside a workspaced codex tab.

Codex 0.150 exposes a per-variable override for this as `shell_environment_policy.filters`: a map from a variable name to `"include"` or `"exclude"`, applied on top of the default policy. An `"include"` entry re-admits a variable the default exclusion set would otherwise drop. Verified against the installed binary — `shell_environment_policy.filters = ["GH_TOKEN"]` fails to load with `invalid type: sequence, expected a map`, and `{ GH_TOKEN = "allow" }` fails with ``unknown variant `allow`, expected `include` or `exclude` `` — so both the key and its two accepted values are confirmed by codex's own config parser rather than assumed.

The project's `.codex/config.toml` is a project-scoped codex config: codex loads it when the project is trusted in the user's `~/.codex/config.toml` (confirmed — with a trust entry present, `codex debug prompt-input` reports the file's `sandbox_mode = "danger-full-access"`; without one it falls back to the built-in `read-only`). The same file is the template `janus init` installs into every project (`src/project-init.ts`, `CONFIG_DIRS`), so one edit fixes this repository and every project scaffolded from it.

## Approach

Add a `[shell_environment_policy.filters]` section to `.codex/config.toml` that marks the two GitHub token variable names as `include`:

```toml
[shell_environment_policy.filters]
GH_TOKEN = "include"
GITHUB_TOKEN = "include"
```

`GH_TOKEN` is the name Janissary injects. `GITHUB_TOKEN` is the other standard name for the same credential — `gh` and most GitHub tooling read either, both are dropped by the same default `*TOKEN*` exclusion, and covering both means the config works whether the token arrives from Janissary's injection or from the user's own environment in a non-workspaced tab.

The section carries a comment explaining why it exists. This is a deliberate exception to the "no comments unless the plan specifies them" rule: a bare `GH_TOKEN = "include"` line in a TOML file gives a later reader no way to know it is compensating for codex's default exclusion set, and the neighbouring `.codex/rules/default.rules` already documents each of its rules the same way.

## Implementation steps

1. `.codex/config.toml` — append the commented `[shell_environment_policy.filters]` section with `GH_TOKEN` and `GITHUB_TOKEN` set to `"include"`. Leave `approval_policy`, `sandbox_mode`, and `sandbox_permissions` untouched.
2. Confirm the edited file still loads: run `codex debug prompt-input` with a `CODEX_HOME` that trusts this project and check it succeeds.
3. `src/project-init.test.ts` — add a test asserting the installed `.codex/config.toml` declares the filter section and both `include` entries.
4. `product/specs/workspaced-agent.md` — extend "GitHub authentication" with the codex-specific behavior.
5. `product/specs/cli.md` — note in the `janus init` paragraph that the installed codex configuration keeps the GitHub token visible to the commands codex runs.
6. `documentation/user-documentation/advanced-agents/workspaced-agent.md` — the page already tells the user that `git push` and `gh` work from inside a workspace once a token is configured, which was untrue for a codex harness; add a sentence covering the codex case.

## Tests

- `src/project-init.test.ts`: `scaffoldProject` installs a `.codex/config.toml` whose contents include a `[shell_environment_policy.filters]` section with `GH_TOKEN = "include"` and `GITHUB_TOKEN = "include"`.

The existing "installs the standard Codex and Claude configurations" test already pins the installed file byte-for-byte against the template, so the new test is what states the intent — it fails loudly if a future codex-config refresh drops the section, which is the regression this plan is guarding against.

## Out of scope

- Any change to `src/sandbox/index.ts`, `src/github-token.ts`, or `src/workspace/index.ts` — the injection side already works and is not what is broken.
- Widening `ENV_SCRUB_PATTERNS` or any sandbox filesystem carve-in.
- Codex's `inherit`, `exclude`, `include_only`, or `ignore_default_excludes` settings — `filters` is the narrow, per-variable override, and disabling the default exclusion set wholesale would expose every other credential-shaped variable in the environment.
- The `.claude/settings.json` template and `.codex/rules/default.rules`.

## Verification

Manual: with a fine-grained PAT in `.janissary/github-token` and the project trusted by codex, open a workspaced codex harness tab and run `git push` and `gh pr create`; both should authenticate with the injected token rather than failing as if no token were present.
