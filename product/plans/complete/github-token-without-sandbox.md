# Deliver the GitHub token to workspaced tabs where isolation is inactive

**Complexity: 3/10** — move one existing injection out of a branch it was nested in, add a helper and focused tests, update three specs and one documentation page. No protocol, remote, or harness changes.

## The finding

The reported symptom is that `GH_TOKEN` is absent from the environment an opencode harness reports on a remote instance, while the same tab on this machine has it. That is not an opencode problem and not a remote-forwarding problem — both of those already work.

Verified locally in a workspaced claude tab on this machine: `GH_TOKEN` and `GH_CONFIG_DIR` are present in the process environment, and `gh auth status` reports `Logged in to github.com account thirtysixthspan (GH_TOKEN)` with `gh api user` returning that login. The local side of the chain is intact.

The remote side of the chain is intact too, up to the last step. `src/remote/manager.ts` sends the loaded token in the `provision` frame, `src/remote/protocol.ts` carries it, and `src/remote/serve.ts` hands it (or the remote project's own token as fallback) to `RemoteProcesses`, which passes it into `spawnPty` and `spawnShell` as `sandbox.githubToken`. All of that is already covered by tests.

The token is dropped at the very end, in `sandboxSpawn` (`src/sandbox/index.ts`). That function begins with an early return:

```ts
if (!options.workspaceDir || !getConfig().sandboxWorkspaces || !sandboxAvailable()) {
  return { command, args, env };
}
```

and the `GH_TOKEN` / `GH_CONFIG_DIR` injection sits well below it, inside the branch that builds the Seatbelt invocation. `sandboxAvailable()` is `process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')`. So on any host where isolation is not active — a Linux remote, which is the ordinary remote case, or any host with `sandboxWorkspaces` turned off — the environment is returned untouched and the token that was loaded, forwarded, and threaded all the way down is never placed in it.

The injection was written as part of the scrub-and-restore dance (`scrubEnv` strips `GH_TOKEN`, then the scoped one is put back), which is why it ended up inside the sandbox branch. But providing a workspaced tab with its scoped credential is a provisioning concern, not an isolation concern: the workspace's `origin` is rewritten to HTTPS and its `credential.helper` is set to `!gh auth git-credential` by `finishProvisioning` on every host, isolated or not, so every workspaced tab needs `GH_TOKEN` for `git push` and `gh` — the ones without isolation just as much as the ones with it. Today those are exactly the tabs that do not get it.

This is harness-independent. claude, codex, and opencode tabs on such a host all see no token; opencode is simply where it was noticed.

## Goal

A workspaced tab is given its scoped GitHub token whether or not workspace isolation is active on the machine running it, so `git push` and `gh` behave the same on a Linux remote as on an isolated macOS host.

## Approach

Extract the two GitHub credential variables into one helper and apply it on both paths through `sandboxSpawn`:

- On the isolated path, nothing changes: the same two variables are set on the scrubbed environment, from the same workspace-private temp dir.
- On the unisolated early-return path, when the spawn is workspaced *and* a token was supplied, return a copy of the caller's environment with those two variables added. With no token, or no workspace, the caller's environment object is returned unchanged exactly as it is today.

`GH_CONFIG_DIR` moves with `GH_TOKEN` rather than staying behind. Its original reason was Seatbelt-specific — `gh` treats the sandbox's deny on `~/.config/gh/hosts.yml` as fatal — but pointing it at an empty workspace-private directory is the right behavior on an unisolated host too: it keeps that host's own ambient `gh` login out of the workspace, which is the guarantee the user documentation already makes ("never touches ... an ambient GitHub credential cached elsewhere on your machine"), and it keeps the two paths behaving identically. The directory it names is under `<workspace>.tmp`, which `finishProvisioning` creates on every host and which is removed with the workspace.

## Implementation steps

1. `src/sandbox/index.ts` — add a helper that returns the `{ GH_TOKEN, GH_CONFIG_DIR }` pair for a given workspace temp dir and token, and a second that applies it to an environment when a workspaced spawn has a token. Call the first from the existing injection site in the isolated branch, and the second from the early return. Move the explanatory `GH_CONFIG_DIR` comment onto the helper and extend it to say why it applies on both paths.
2. `src/sandbox/index.test.ts` — add the tests below.
3. `product/specs/sandbox.md` — state in "Environment scrubbing" that the GitHub credential pair is not conditional on isolation being active.
4. `product/specs/workspaced-agent.md` — state the same in "GitHub authentication".
5. `product/specs/remote-server.md` — note that the forwarded token reaches the remote tab's processes regardless of the remote's own isolation state.
6. `documentation/user-documentation/advanced-agents/workspaced-agent.md` — the page ties the token to the sandbox and promises push/`gh` work in a remote workspace; add a sentence that the token is provided whether or not isolation is active on the machine running the tab.

## Tests

`src/sandbox/index.test.ts`, all of which run on any platform because they drive the unisolated path through the `sandboxWorkspaces: false` config rather than through the platform check:

- With isolation configured off, a workspaced spawn carrying a `githubToken` gets `GH_TOKEN` set to that token and `GH_CONFIG_DIR` pointing inside the workspace's `.tmp` directory.
- With isolation configured off, a workspaced spawn carrying a `githubToken` leaves the rest of the caller's environment intact and does not scrub it.
- With isolation configured off and no `githubToken`, the input is still returned unchanged — the existing contract.
- With no `workspaceDir` but a `githubToken` supplied, the input is returned unchanged: a non-workspaced tab never receives the scoped token.

Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

- Any change to the remote protocol, `src/remote/*`, or token forwarding — that chain is correct and tested.
- Any change to `.codex/config.toml`, opencode, or harness-specific environment handling.
- Making Seatbelt isolation available on Linux, or any other sandbox-portability work.
- Scrubbing the environment on hosts without isolation. Scrubbing exists to close escape vectors the Seatbelt profile also closes; applying half of it where the profile is absent would change unrelated behavior for every unisolated workspaced tab.
