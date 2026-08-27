# Collapse the four token modules into one registry

**Complexity: 5/10** — broad but mechanical. Fifteen source files change and eight are deleted, yet no behavior does: the same four files are read from the same paths, the same four variables reach the same spawns. The only externally visible effect is the protocol version.

Four credential files are now read by four modules that differ in nothing but a filename and a variable name, and each was added by touching nine files across the local and remote chain. The loader duplication is the visible half and the cheap half. The half that actually costs is the `provision` frame carrying one named field per token, which forces every new credential through the protocol, the serve-side fallback resolution, `RemoteProcesses`, `SandboxOptions`, and three local call sites, one hand-written line at a time.

This is the change that was deferred twice, done on its own so a failure in it cannot be mistaken for a failure in whatever token prompted it.

## Approach

**One table, in the shape this codebase already uses for tables.** `src/sandbox/paths.ts` opens with "Extending any restriction is a one-line table change here", and that is exactly the property the token chain should have. `src/project-tokens.ts` holds a row per credential — the filename under `.janissary/`, and the environment variable it becomes — plus one loader that walks it and one cache that holds the results.

```ts
export type ProjectTokenName = 'github' | 'claude' | 'opencode' | 'gemini';
export type ProjectTokens = Partial<Record<ProjectTokenName, string>>;
```

`loadProjectTokens(projectDir)` replaces four load calls; `getProjectTokens()` replaces four getters and returns the whole record.

**`ProjectTokens` becomes the one currency.** `SandboxOptions` drops its four named fields for a single `tokens?: ProjectTokens`. `RemoteProcesses`'s `credentials` object is already that shape by hand and becomes the type itself. The `provision` frame carries `tokens?: ProjectTokens` instead of four optional strings. Three local call sites collapse from four lines each to one.

**The GitHub token stays the one special case, explicitly.** It is the only credential needing a companion variable (`GH_CONFIG_DIR`, pointing at a workspace-private directory so `gh` finds a genuinely absent `hosts.yml` rather than a denied one). Its row carries `GH_TOKEN` like any other, and `workspaceCredentialEnv` adds the companion in a single guarded line after the table walk. Encoding "sometimes there is a second variable" as a table column would make three rows carry a field only one uses.

**Version 6, and this one is not about a new field.** The frame's shape changes rather than growing, so a version-5 remote decoding a `provision` frame finds none of the fields it reads and provisions a workspace with no credentials at all — a louder failure than the silent ones the previous bumps guarded, and the same refusal covers it. Worth noting for release planning: this is the fourth bump in short order, and they are cumulative, so they want to ship as one upgrade.

**Behavior is preserved exactly, and the tests are what say so.** Every existing assertion about which variable reaches which spawn stays, rewritten only where it names the options shape. The four loader test files become one that walks the table, so a fifth credential is a row there too.

## Implementation steps

1. `src/project-tokens.ts` — new module: the `PROJECT_TOKENS` table (name, file, env), `ProjectTokenName`/`ProjectTokens` types, `loadProjectTokens`, `getProjectTokens`, module-level cache. Carry over the per-token reasoning from the four modules' comments rather than dropping it: what each credential is for, and why the two harness ones exist at all given their CLIs have their own stores.
2. Delete `src/github-token.ts`, `src/claude-token.ts`, `src/opencode-token.ts`, `src/gemini-token.ts` and their four test files.
3. `src/project-tokens.test.ts` — new, replacing the four: every table row loads its own file and trims it; a missing file and an empty file each yield no entry; `getProjectTokens` returns what was loaded; a second load against a different directory replaces the cache rather than merging into it.
4. `src/sandbox/index.ts` — replace the four `SandboxOptions` fields with `tokens?: ProjectTokens`; rewrite `workspaceCredentialEnv` to walk the table, keeping the `GH_CONFIG_DIR` companion as its own guarded line; update `withWorkspaceCredentials` for the new shape.
5. `src/shell-manager.ts`, `src/pseudoterminal-manager.ts`, `src/acp/index.ts` — one `tokens:` line each in place of four.
6. `src/git-sync.ts` — `getProjectTokens().github` in place of `getGithubToken()`.
7. `src/main.ts` — one `loadProjectTokens(cwd)` in place of four calls.
8. `src/remote/protocol.ts` — the `provision` variant carries `tokens?: ProjectTokens`, imported as a type from `project-tokens.js` so the wire contract keeps one definition; bump `REMOTE_PROTOCOL_VERSION` to `6` and rewrite the constant's comment, which currently enumerates one version per token and should instead say what the versions mean.
9. `src/remote/serve-processes.ts` — `credentials: ProjectTokens`, passed straight into the sandbox options.
10. `src/remote/serve.ts` — `loadProjectTokens(resolved.root)` at startup; `provision(label, forwarded?: ProjectTokens)` resolving each name against the remote's own tokens in one merge rather than four `??` lines; the GitHub notice keeps reading the two GitHub values it already reads.
11. `src/remote/manager.ts` — send `tokens: getProjectTokens()`.
12. Tests in `src/sandbox/index.test.ts`, `src/remote/{protocol,serve,serve-processes}.test.ts`, and `src/git-sync.test.ts` — update to the new options and frame shape, and to mock `project-tokens.js`. Keep every existing assertion about which variable lands where.
13. `product/specs/sandbox.md`, `product/specs/remote-server.md`, `product/specs/workspaced-agent.md` — update the module names these reference (`src/github-token.ts` and friends) to the registry, and describe the frame as carrying a token map. No behavioral wording changes, because there is no behavior change.

## Tests

- `src/project-tokens.test.ts` (new, replacing four): each row reads its own `.janissary/` file and trims surrounding whitespace; a missing file yields no entry; a whitespace-only file yields no entry; `getProjectTokens` returns the loaded record; loading a second project directory replaces the previous cache rather than merging, which the old per-module caches got for free and a shared record could plausibly get wrong.
- `src/sandbox/index.test.ts`: every existing per-variable assertion survives against `tokens: { … }`, including the all-four case and the ambient-value cases that pin the scrub exemptions.
- `src/remote/protocol.test.ts`: a `provision` frame carrying a full token map round-trips intact; a handshake announcing version 5 is refused.
- `src/remote/serve-processes.test.ts` and `src/remote/serve.test.ts`: unchanged in intent — forwarded tokens reach the spawn, per-token fallback to the remote's own file still resolves per name, and no notice appears for the provider credentials.

No new behavior is under test here, which is the point: the suite passing unchanged in intent is the evidence the refactor is safe.

## Out of scope

- **Adding, removing, or renaming any credential.** Same four files, same four variables, same precedence.
- **The `.janissary/` file names and the environment variable names** — both are user-facing contracts and both stay exactly as they are, which is why no user documentation changes.
- **Validating the token map's shape in `decodeFrame`.** The named fields it replaces were equally untyped at runtime, and the version guard is what keeps the two ends agreeing; adding schema validation to one frame field and not the rest would be an odd place to start.
- **The `GH_CONFIG_DIR` companion**, which stays a guarded special case rather than becoming a table column.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step — the existing suite is the regression test for this change, so it should stay green throughout rather than only at the end. `npm run docs:build` for the spec edits.

Manual: with all four token files configured, open a workspaced harness and confirm each credential is present in its environment; repeat against an updated remote and confirm the forwarded values and the per-token fallback both still apply.
