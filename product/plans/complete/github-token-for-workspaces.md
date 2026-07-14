# Pass a scoped GitHub token to workspaces

**Complexity: 6/10** — new token-loading module, sandbox env-injection path, workspace clone/credential-helper setup, three `SandboxOptions` construction sites updated, config/spec/README updates, tests.

Workspaced tabs (`agent --workspace`, `harness --workspace`) clone the root repo's `origin` remote directly (`src/workspace.ts` `createWorkspace`). Today that clone is unusable for `git push` inside the Seatbelt sandbox: `origin` is typically an SSH remote, and the sandbox denies `~/.ssh` and scrubs `SSH_AUTH_SOCK` (`src/sandbox-profile.ts`), so publickey auth can never succeed. `gh pr create`/`gh pr merge` partially work today via the `~/Library/Keychains` read carve-in, but that's incidental, not a deliberate design, and still leaves `git push` broken.

## Approach

Give every workspaced tab a narrowly-scoped GitHub token via `GH_TOKEN`, and switch workspace clones to HTTPS so both `git push` (via a local credential helper that shells out to `gh`) and `gh` itself authenticate off that one env var — no SSH, no `~/.config/gh`, no reliance on the user's own ambient `gh auth` scopes.

**Token provisioning (manual, one-time, per project):** the user creates a GitHub fine-grained PAT scoped to just this repo with `Contents: write`, `Pull requests: write`, `Metadata: read` — nothing else — and drops it in `.janissary/github-token` (already-gitignored directory, mode `0600`). No UI/CLI to create tokens; janissary only reads the file. If the file is absent, workspaces behave exactly as today (no token injected, push/PR-merge inside the sandbox may fail) — this is a no-op, backwards-compatible default, not a hard requirement for workspace creation.

**Loading:** new module `src/github-token.ts`:
```ts
export function loadGithubToken(projectDir: string): string | undefined
```
Reads `.janissary/github-token`, trims whitespace, returns `undefined` if missing/empty. Loaded once at startup (mirrors `loadConfig` in `main.ts`) and cached in a module-level variable, exposed via `getGithubToken()`.

**Workspace clone changes (`src/workspace.ts`):**
- `getRemoteUrl` gains a companion `toHttpsUrl(url: string): string` that normalizes `git@github.com:owner/repo.git` (and `ssh://git@github.com/owner/repo.git`) to `https://github.com/owner/repo.git`; URLs already HTTPS pass through unchanged.
- `createWorkspace` clones the HTTPS form, then sets a **local-only** credential helper on the new clone:
  ```
  git -C <target> config --local credential.helper "!gh auth git-credential"
  ```
  This never touches global git config; it only affects this disposable clone. `gh auth git-credential` (gh's built-in credential-helper mode) checks `GH_TOKEN` in its environment before falling back to its keychain-stored OAuth token, so once `GH_TOKEN` is injected into the sandboxed process env (next step), `git push` over HTTPS authenticates via the injected token automatically.

**Sandbox env injection (`src/sandbox.ts`):**
- `SandboxOptions` gains `githubToken?: string`.
- `scrubEnv` already strips any ambient `GH_TOKEN`/`GITHUB_TOKEN` via `ENV_SCRUB_PATTERNS` — that stays unchanged (never trust an inherited value).
- In `sandboxSpawn`, right after `scrubbed.TMPDIR = tmpDir`, add:
  ```ts
  if (options.githubToken) scrubbed.GH_TOKEN = options.githubToken;
  ```
  This is the one deliberate exception to "a scrubbed var never comes back" — it's not the ambient var, it's a fresh value we chose to hand this specific workspaced spawn.

**Wiring the token into the three `SandboxOptions` construction sites** (all currently build `{ workspaceDir, offline }`):
- `src/pseudoterminal-manager.ts:23`
- `src/shell-manager.ts:42`
- `src/acp.ts:27`

Each becomes `{ workspaceDir, offline, githubToken: workspaceDir ? getGithubToken() : undefined }` — only workspaced tabs (which have a `workspaceDir`) ever get the token; a non-workspaced tab never sees it regardless of whether the file exists.

## Out of scope

- No GitHub App / auto-minted short-lived tokens — a static, user-provisioned fine-grained PAT is the v1 scope. Rotation is manual.
- No UI/command to create or edit the token file — the user edits `.janissary/github-token` directly.
- No token revocation on workspace removal (the token is shared across all workspaces of the project, not minted per-workspace).
- Not changing `scripts/pr-*.sh` — they already just call `git`/`gh` and will pick up the new auth path for free once it works.

## Implementation steps

1. `src/github-token.ts` — `loadGithubToken`, `getGithubToken`, module-level cache. Load it in `main.ts` alongside `loadConfig`.
2. `src/workspace.ts` — add `toHttpsUrl`, use it in `createWorkspace`, add the `credential.helper` config call after cloning.
3. `src/sandbox.ts` — add `githubToken` to `SandboxOptions`, inject `GH_TOKEN` in `sandboxSpawn`.
4. Update the three construction sites above.
5. Docs: `spec/workspaced-agent.md`, `spec/sandbox.md` (document the `GH_TOKEN` injection as the deliberate exception to the scrub list), `README.md` (setup instructions + required PAT scopes), `docs/PR_AUTOMATION.md` (note push/PR now authenticate from inside a sandboxed workspace).

## Tests

- `src/workspace.test.ts`: `toHttpsUrl` converts `git@github.com:owner/repo.git` and `ssh://git@github.com/owner/repo.git` to `https://github.com/owner/repo.git`; passes through an already-HTTPS URL unchanged. `createWorkspace` sets `credential.helper` locally on the clone (assert via `git -C ws config --local credential.helper`).
- `src/sandbox.test.ts`: `sandboxSpawn` with `githubToken` set produces an env containing `GH_TOKEN=<value>`; without it, `GH_TOKEN` is absent even if `process.env.GH_TOKEN` was set ambient (i.e., scrub still wins when no override is given).
- `src/github-token.test.ts`: `loadGithubToken` returns the trimmed token when the file exists, `undefined` when missing.

## Verification

Manual: with a fine-grained PAT in `.janissary/github-token`, open a workspaced tab, `git push -u origin <branch>` should succeed over HTTPS without any SSH/keychain prompt; `gh pr create` should succeed using the same token.
