# Document the GitHub token scopes for workspaced harnesses

**Complexity: 1/10** — documentation-only change to one public docs page; no source, test, or
spec changes.

## Goal

The public docs already explain that a workspaced agent/harness needs a GitHub token at
`.janissary/github-token` to `git push`/use `gh` from inside the sandbox
(`documentation/user-documentation/advanced-agents/workspaced-agent.md`, "Pushing to GitHub
needs a token"), and `documentation/user-documentation/advanced-agents/harness.md` already links
`-w`/`--workspace` on harness tabs to that same page ("See Workspaced agents for how the clone,
sandboxing, and GitHub authentication work."). What's missing is the concrete detail: which
token type and which permission scopes to grant. Today the page just says "a fine-grained
personal access token scoped to just the repositories the agent should reach" with no scope
list, so a user has no way to know what to check when creating the token.

## Root cause / gap

The exact scopes are already documented, but only in the **developer** docs
(`documentation/developer-documentation/workspace-sandbox.md:19`): "a fine-grained personal
access token... with Contents: Read and write, Pull requests: Read and write, and Metadata:
Read-only permissions". The **public/user** docs page never got the same detail. Since the
issue asks to update the public documentation, and harness tabs already point at this same page
for the mechanism, updating `workspaced-agent.md` covers both agents and harnesses without
duplicating the explanation in `harness.md`.

## Approach

Enrich the "Pushing to GitHub needs a token" section in
`documentation/user-documentation/advanced-agents/workspaced-agent.md` with the same concrete
detail already present in the developer docs: a link to create a fine-grained PAT, the exact
three permissions to grant, and a note that the file is gitignored. No new page — the existing
section is the right home, and `harness.md` already links to it, so harness users reach the
updated content too.

## Implementation steps

1. **`documentation/user-documentation/advanced-agents/workspaced-agent.md`** — replace the last
   sentence of the "Pushing to GitHub needs a token" section with more concrete guidance:
   ```markdown
   That credential is a scoped GitHub token placed in `.janissary/github-token` in your project. With it, `git push` and `gh` (creating and merging PRs) work from inside the workspace. Without it they fail; local development is unaffected either way.

   Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) scoped to just the repositories the agent should reach, with **Contents: Read and write**, **Pull requests: Read and write**, and **Metadata: Read-only** permissions — nothing broader. Save the token value to `.janissary/github-token` (already gitignored; janissary only ever reads this file, never writes to it).
   ```

## Tests

None — documentation-only change, nothing executable to test.

## Out of scope

- `documentation/user-documentation/advanced-agents/harness.md` — already links to
  `workspaced-agent.md` for "how... GitHub authentication work[s]"; no separate explanation is
  needed there, so it is not touched.
- The stale "SSH tabs can't be watched this way" line in `harness.md` — a pre-existing
  inaccuracy unrelated to this issue (SSH tabs became monitorable in a prior fix); out of scope
  here to avoid touching files the current fix doesn't need.
- `documentation/developer-documentation/workspace-sandbox.md` — already has the correct detail;
  no change needed.

## Verification

- `./scripts/run.mjs check-diff` — confirms the change doesn't affect any lint/typecheck/test
  target (a markdown-only diff).
- Manual: read the updated section for clarity; no running app behavior to exercise.
