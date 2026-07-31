# Document GitHub repo creation and PAT setup in the new-project guide

**Complexity: 1/10** — documentation only, no code changes.

## Goal

`documentation/user-documentation/workflows/creating-a-new-project.md` walks through creating a git repository and pointing `origin` at GitHub, but stops short of two steps a new user actually needs to get PR automation and workspaced-agent pushes working: creating the GitHub repository itself, and creating/storing a GitHub personal access token at `.janissary/github-token` so `src/github-token.ts` (`loadGithubToken`) can inject it into sandboxed workspace shells.

## Approach

Extend the existing "Start with a git repository" section (which already tells the reader to "create the remote on GitHub first") with concrete steps for creating the repo (via the GitHub web UI or `gh repo create`), and add a new short section afterward covering the PAT: what scopes it needs (Contents write, Pull requests write, Metadata read — matching the comment in `src/github-token.ts:6-7`), where to create it (github.com/settings/tokens, fine-grained tokens), and that it should be saved to `.janissary/github-token` in the project directory — noting that `.janissary/` is already gitignored so the token is never committed. Mention this step is optional (workspaces still work for local development without it; only `git push`/`gh` from inside a workspace need it), matching the caveat already in `product/specs/workspaced-agent.md`.

## Implementation steps

1. Edit `documentation/user-documentation/workflows/creating-a-new-project.md`, "Start with a git repository" section: expand the note about creating the remote on GitHub first into a short concrete step (web UI: github.com/new; or `gh repo create`).
2. Add a new section, "Add a GitHub token for workspaced pushes" (placed after "Start with a git repository", before "Scaffold the project"), describing:
   - Why: sandboxed [workspaced agents](/user-documentation/advanced-agents/workspaced-agent) can't authenticate over SSH, so `git push`/`gh` from inside a workspace need an HTTPS-compatible token.
   - Where to create one: github.com/settings/tokens, a fine-grained personal access token scoped to the repo, with Contents (write), Pull requests (write), and Metadata (read) permissions.
   - Where to store it: `.janissary/github-token` in the project root, plain text, trimmed of whitespace on read. Note `.janissary/` is gitignored by default, so the token is never committed.
   - That this step is optional — skip it and workspaces still work for local development (commit, fetch, pull); only pushing to GitHub or using `gh` from inside a workspace requires it.

## Tests

None — documentation-only change; no test coverage applies.

## Spec

No functional spec change — `product/specs/workspaced-agent.md` already documents the token's role from the app's side (`.janissary/github-token`, injected into sandboxed shells); this fix only makes the user-facing setup guide describe how to produce that file, which isn't itself app behavior.

## Out of scope

- Changing `src/github-token.ts` behavior or scope requirements.
- Adding a `janus`-side command to create or validate the token file.
