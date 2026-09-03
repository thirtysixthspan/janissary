# Pass the launching user's git identity to workspaced tabs, local and remote

**Complexity: 4/10** — one new module mirroring `src/project-tokens.ts`, one injection point in the sandbox that already injects credentials the same way, one optional field on an existing protocol frame, and spec updates. No new architecture.

A workspaced tab's `git commit` takes its author from whatever git config the process can see. Locally that happens to work: the sandbox carves `~/.gitconfig` into the read allow-list, so a commit made inside a workspace carries the same name and email the user commits with outside it. On a remote machine it does not. `janus remote-serve` runs as whatever account the ssh destination resolves to, and the workspace clone it provisions inherits that machine's `~/.gitconfig` — so commits an agent makes there are attributed to the remote host's account, or fail outright with git's "Please tell me who you are" when that account has no identity configured at all.

The identity of the user who opened janissary is known on the local side and is the one that should sign every commit a workspaced tab makes, on either machine. Git already has a supported way to say so that needs no config file: `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL` override `user.name`/`user.email` for the process that has them set. Injecting those four for every workspaced spawn is the same shape of solution the project tokens already use — read once at startup, forwarded over the `provision` frame, injected per workspaced spawn — so this follows that module for module rather than inventing a second mechanism.

## Approach

**Loading.** New module `src/git-identity.ts`, a direct mirror of `src/project-tokens.ts`: `loadGitIdentity(projectDir)` asks git itself for `user.name` and `user.email` (`git config --get`, run in the project directory so the project's own `.git/config` wins over the global one, exactly as a commit made there would resolve them), caches the result in a module-level variable, and returns an empty record when git has no identity to give. `getGitIdentity()` reads the cache. Loaded once in `main.ts` next to `loadProjectTokens`, and once in `runRemoteServer` for the far end — where it is the fallback, not the answer.

**Injection.** `sandboxSpawn` sets the four variables from the cached identity for every workspaced spawn, on both paths — the confined path (after the scrub) and the unconfined pass-through — for the same reason `GH_TOKEN` is set on both: a workspace on a host that cannot confine anything still needs its commits attributed. Injection is gated on `workspaceDir`, so a non-workspaced tab keeps resolving its identity from git config the way it always has. Nothing is threaded through `SandboxOptions`: unlike a project token, which the remote side merges per provision, an identity is a single process-wide fact on both machines, so the sandbox reads the module cache directly and no call site changes.

**Forwarding.** The `provision` frame grows an optional `identity` field alongside `tokens`, sent by `RemoteManager` from `getGitIdentity()` and decoded by `frame-decode.ts` with the same strictness `tokens` gets. On receipt, `RemoteServer.provision` installs a non-empty forwarded identity over the one it loaded from its own machine. Whole-record replacement, not per-field merge: a name from one machine paired with an email from another is an identity that belongs to nobody, which is worse than either machine's own.

**`REMOTE_PROTOCOL_VERSION` moves 9 → 10.** The constant's own comment sets the rule: a field one end fills in and the other is expected to honor is as much a contract as a new frame type, "because an end that merely ignores it looks healthy while doing the wrong thing" — and every credential added to `provision` moved the version for exactly that reason. This field is the archetype of that failure. A version-9 remote ignores `identity`, provisions a workspace that looks entirely healthy, and silently attributes every commit to the ssh destination's account, which is the bug being fixed.

**Both author and committer.** Git distinguishes the two, and a commit made by an agent in a workspace has no meaningful distinction to draw — the user who opened janissary is both. Setting only the author pair would leave the committer resolving from the remote machine's config, which is the half of the problem that produces "Please tell me who you are".

**Not added to `ENV_SCRUB_PATTERNS`.** The four variables carry a name and an email address, not a credential, and scrubbing them is precisely what this fix exists to avoid.

## Implementation steps

1. `src/git-identity.ts` — new module: `GitIdentity` type, `loadGitIdentity`, `setGitIdentity`, `getGitIdentity`, `gitIdentityEnv`, module-level cache. Mirror `src/project-tokens.ts`'s structure and comment style.
2. `src/main.ts` — import and call `loadGitIdentity(cwd)` alongside the existing `loadProjectTokens(cwd)`.
3. `src/sandbox/index.ts` — fold the identity into the workspace environment the two existing branches already build, keeping the `GH_TOKEN`/`GH_CONFIG_DIR` behavior byte-for-byte and still returning the caller's own env object untouched when neither a token nor an identity applies.
4. `src/remote/protocol.ts` — add `identity?: GitIdentity` to the `provision` frame and bump `REMOTE_PROTOCOL_VERSION` to 10, with the version comment saying what a version-9 remote does wrong.
5. `src/remote/frame-decode.ts` — decode and validate `identity`, refusing a malformed one the way a malformed `tokens` record is refused.
6. `src/remote/manager.ts` — send `identity: getGitIdentity()` on the `provision` frame.
7. `src/remote/serve.ts` — `loadGitIdentity(resolved.root)` at startup; in `provision`, install a non-empty forwarded identity with `setGitIdentity`.
8. `product/specs/sandbox.md` — extend "Environment scrubbing" with the four variables, where they come from, and why they are not scrubbed.
9. `product/specs/remote-server.md` — record that the launching user's git identity is forwarded on provision, that a forwarded identity wins over the remote machine's own, that the record is validated like the token map, and what a remote one version behind gets wrong.
10. `documentation/user-documentation/advanced-agents/workspaced-agent.md` — narrow the "never touches your own git config" sentence to credentials and say what a workspaced tab's commits are attributed to, locally and on a remote.

## Tests

- `src/git-identity.test.ts` (new): reads `user.name`/`user.email` from a real temporary repo and caches them for `getGitIdentity`; returns an empty record for a directory git has no identity for; `setGitIdentity` replaces the cache; `gitIdentityEnv` maps a full identity onto all four variables, maps a partial one onto only the variables it can fill, and returns an empty record for an empty identity.
- `src/sandbox/index.test.ts` (extended): injects all four variables on a confined workspaced spawn once an identity is loaded; injects them on the unconfined pass-through path too; does not inject them for a spawn with no `workspaceDir`; overrides an ambient `GIT_AUTHOR_NAME` rather than leaving the caller's value in place.
- `src/remote/protocol.test.ts` (extended): a `provision` frame round-trips its `identity`; a non-object, an unknown key, and a non-string value are each refused as malformed; a frame with no `identity` key decodes without one, so the existing token-only cases keep their shape.
- `src/remote/serve.test.ts` (extended): a forwarded identity replaces the remote machine's own for subsequent spawns; a provision with no identity leaves the remote's own in place.

## Out of scope

- **Writing `user.name`/`user.email` into the workspace clone's git config.** The environment variables override config for the processes that need them and leave no state behind in the clone; a written config would have to be kept in sync and would be wrong for anything that later reuses the directory.
- **Any identity source other than git config** — the OS account name, an application config field, a GitHub profile lookup. Git config is what a commit made outside the workspace already uses, so it is the identity the user expects to see.
- **Signing.** `user.signingkey`, `commit.gpgsign`, and the GPG/SSH agent sockets stay as they are; the sandbox deliberately scrubs those sockets and this fix does not change that.
- **Non-workspaced tabs.** They already resolve the same identity from the same git config, unsandboxed, with nothing in the way.
- **New user documentation.** One correction is in scope rather than out: `documentation/user-documentation/advanced-agents/workspaced-agent.md` already tells the reader that "pushing from inside a workspace never touches your own git config", which this fix makes misleading — the sentence is about credentials, but the workspace now does read that config for the identity. It is narrowed to credentials and given the identity as its own paragraph. Nothing else is added; no other page describes how a workspaced tab attributes its commits.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: open a workspaced tab on a remote machine whose account has no git identity configured, make a commit inside it, and confirm the commit carries the local user's name and email rather than failing.
