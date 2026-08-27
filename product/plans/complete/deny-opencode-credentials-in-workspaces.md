# Deny a workspaced tab access to opencode's credential file

**Complexity: 3/10** — one entry in an existing table, one new deny rule in the profile, and the tests and documentation that pin the behavior change. The mechanism already exists and is already used for the equivalent Claude file.

`~/.local/share/opencode/auth.json` holds every provider credential opencode has been given, in plaintext. It sits inside `.local/share/opencode`, which is in `HOME_WRITE_CARVEOUTS` and therefore also in `HOME_READ_CARVEINS`, so a workspaced tab can read it and write it today. The equivalent Claude file, `~/.claude/.credentials.json`, is in `SECRET_DENY_PATHS` and has never been reachable.

That asymmetry was load-bearing until now: denying opencode's file would have left a workspaced opencode harness with no way to authenticate at all. It no longer is. `.janissary/opencode-token` is injected as `OPENCODE_API_KEY` into every workspaced spawn and forwarded to remote workspaces, so the credential arrives by the same route the Claude token does, and the file read is no longer the only path in.

## Approach

**Add `.local/share/opencode/auth.json` to `SECRET_DENY_PATHS`.** The secret deny is applied last, so it wins inside a carve-in — which is exactly the situation here, and worth a comment: every other entry in that table is already outside every carve-in and denied explicitly as defence in depth, while this one is the first whose deny actually does the work.

The deny carries `(with errno ENOENT)`, so the read reports the file as genuinely absent rather than permission-denied. That matters for more than secrecy: a tool that treats `EPERM` on its config as fatal refuses to run at all (this is the whole reason `GH_CONFIG_DIR` is redirected for `gh`), while a missing credential file is the ordinary first-run state every such tool handles.

**Deny writes to secret paths too**, with a new `(deny file-write* …)` after the write allows. Without it this change makes things worse rather than better: with the read returning ENOENT, opencode inside a workspace sees no credentials at all, and anything that then writes the file — an `opencode auth login` an agent decides to run — would overwrite the user's real credentials on the host. Denying the write turns that from a silent clobber into a plain failure. It is a no-op for every pre-existing entry in the table, all of which sit outside every write carve-out already and are denied by the top-level default.

**The cost, stated plainly.** `auth.json` is not opencode's OpenCode-provider file, it is *all* of its providers. A user who ran `opencode auth login` against Anthropic, Google, or OpenAI has that key in the same file, and `.janissary/opencode-token` does not replace it — `OPENCODE_API_KEY` is what OpenCode Zen and OpenCode Go declare and nothing else. After this change, those providers stop working inside a workspace unless the user exports the provider's own variable (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_*`), which the environment scrub deliberately exempts and passes through untouched. That is a real behavior change for a real configuration, not a theoretical one, and the spec and user documentation both say so rather than burying it.

## Implementation steps

1. `src/sandbox/paths.ts` — add `.local/share/opencode/auth.json` to `SECRET_DENY_PATHS`, with a comment covering three things: it holds every opencode provider credential in plaintext; it is the first entry whose deny overrides a carve-in rather than backing one up; and the workspaced route in is now `OPENCODE_API_KEY` (see `opencode-token.ts`). Extend the table's leading comment to note that entries are denied for writes as well.
2. `src/sandbox/profile.ts` — add a `(deny file-write* ${secretDenyClauses})` rule immediately after the `file-write*` allow block, with a comment explaining it is a no-op for every entry outside the write carve-outs and exists so a credential file *inside* one cannot be overwritten by the sandboxed process.
3. `product/specs/sandbox.md` — add the file to the documented secret list, note the write deny, and record why the opencode entry is different from its neighbours.
4. `product/specs/workspaced-agent.md` — extend "Harness authentication" so the opencode paragraph no longer says a signed-in machine needs no token file: inside a workspace it now does, for the OpenCode providers, and other providers need their own environment variable.
5. `documentation/user-documentation/advanced-agents/tokens.md` — correct the "Most of the time you won't need this one" framing, which this change makes wrong, and say what a non-OpenCode provider needs instead.
6. `documentation/user-documentation/advanced-agents/workspacing.md` — the credentials sentence lists what a workspace cannot see; add the harness credential files to it.

## Tests

- `src/sandbox/index.test.ts` (default project, always runs): the `-D` params for a confined spawn include one bound to `<home>/.local/share/opencode/auth.json`, proving the table entry reaches the profile invocation; the read carve-in for `.local/share/opencode` itself is still present, so denying the credential file did not deny the directory.
- `src/sandbox/live.sandbox.test.ts` (darwin-only `sandbox` project): with the real `auth.json` present on the machine, a sandboxed `cat` of it fails reporting `No such file or directory` and not `Operation not permitted`; a sandboxed write to it fails while a write to a sibling path under the same directory still succeeds, proving the deny is scoped to the credential file rather than the carve-out. The test only reads the real file and only writes a uniquely-named sibling it removes afterwards — it never creates, modifies, or deletes `auth.json`. Skipped when the file is absent.

## Out of scope

- **Any change to what `.janissary/opencode-token` covers.** It supplies `OPENCODE_API_KEY`, which is what the OpenCode Zen and OpenCode Go providers declare. Forwarding a per-provider credential for opencode's other providers would be a different feature.
- **The `~/.claude` and `~/.codex` credential paths.** The Claude file is already denied; codex's `~/.codex/auth.json` is reachable in a workspace for the same reason opencode's was, but no codex token is forwarded yet, so denying it would leave a codex harness with no way in at all. That is the same trade this plan resolves for opencode, and it should be made only once the same route exists.
- **Narrowing the `.local/share/opencode` write carve-out**, which covers the session database, logs, and state that a working harness writes constantly.

## Verification

Automated: `./scripts/run.mjs check-diff`, plus `npx vitest run --project sandbox` for the live tests, plus `npm run docs:build`.

Manual: with a key in `.janissary/opencode-token`, open a workspaced opencode harness and confirm it runs against an OpenCode model; confirm `cat ~/.local/share/opencode/auth.json` from inside that tab reports no such file.
