# Web search 3: Tavily and TinyFish token rows in the project token table

**Complexity: 3/10** — ~16 added lines in 2 files (two table rows plus a protocol version bump), 6 requirements, 6 test scenarios (p=4.75)

The third slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It adds `tavily` and `tinyfish` rows to `PROJECT_TOKENS` (`src/project/tokens.ts`), so both search providers' API keys follow every rule the harness tokens already follow: read once at startup from the project's `.janissary/` and then `~/.janissary/`, forwarded to a remote machine at workspace provisioning, and set as environment variables wherever the table's credentials reach. Because a remote decodes the provisioning token map against its own table, adding a row also moves `REMOTE_PROTOCOL_VERSION`, as the Kilo row did in version 33. The provider manifests (`./product/plans/complete/web-search-5-provider-registry.md`) name these rows by their `ProjectTokenName` values `'tavily'` and `'tinyfish'`; those two names are the contract with that slice and must be spelled exactly so.

## Dependencies

None in code. Ordered after `./product/plans/complete/web-search-2-result-rendering.md` only so the feature lands in one sequence; it does not import anything from earlier subplans. Later slices depend on it: `web-search-5` (manifest `token` fields), `web-search-7` (its protocol bump is one past the value this slice sets).

## Design decisions

Carried verbatim from the source plan.

- **Credentials (feature text, from precedent).** Each provider's token is read from `.janissary/<service>-token`, e.g. `.janissary/tavily-token`, following the file convention `src/project/tokens.ts` already uses: the project's `.janissary/` first, then the user's `~/.janissary/`, a whitespace-only file counting as absent.
- **Tokens on each host (user decision).** `tavily` (file `tavily-token`, env `TAVILY_API_KEY`) and `tinyfish` (file `tinyfish-token`, env `TINYFISH_API_KEY`) become rows in `PROJECT_TOKENS` (`src/project/tokens.ts`), so they follow every rule the harness tokens already follow: read once at startup, project `.janissary/` first and `~/.janissary/` second; forwarded to a remote machine at workspace provisioning, where a forwarded value wins over the remote's own file and the remote's own file is the fallback (`src/remote/serve-provision.ts`). As with every non-GitHub row in that table, the two variables are also set in the environment of every process the table's credentials reach (`src/sandbox/environment.ts`): workspaced shells, harnesses, and ACP agents through `workspaceCredentialEnv`, and ACP agents outside any workspace, monitors included, through `agentCredentialEnv`. That exposure was put to the user with this full reach and kept (user decision): the rows carry their variables like every other harness credential, and no row gets an empty `env` list. Because tokens are read once at startup, a token file added while Janissary runs takes effect at the next restart, as a new harness token does; reading the files on each search is the upgrade path if that proves annoying.
- **No other code edits beyond the version bump.** `src/remote/frame/decode-provision.ts` (`TOKEN_NAMES` built from `PROJECT_TOKENS`) and `src/sandbox/environment.ts` (`tokenVariables` walks `PROJECT_TOKENS`) need no edit. `src/acp/index.ts` (`agentCredentialEnv(tokens)` for a session with no `workspaceDir`) and `src/remote/entry-factory.ts` (sends `getProjectTokens()` on `provision`) pick the rows up unchanged.

Decisions this pass adds, grounded in the repo:

- **Protocol version moves (from precedent).** `decodeTokens` in `src/remote/frame/decode-provision.ts` refuses any name outside its own table and rejects the whole `provision` frame as malformed. So a peer without these rows would fail provisioning the moment a Tavily or TinyFish key is forwarded. `product/specs/remote-server.md` ("Each new credential therefore moves the version, as the Kilo key does in version 33") and the version-33 comment in `src/remote/protocol.ts` make this the rule. This slice therefore sets `REMOTE_PROTOCOL_VERSION` one past its current value (42 → 43 today) with a comment shaped like the version-33 one: it adds the `tavily` and `tinyfish` names to the `provision` token map, and a version-42 remote would refuse them and fail provisioning. `web-search-7`'s own bump for the `web-search` operation then goes one past this value (43 → 44 today), which its "one past whatever it is when this lands" wording already covers.
- **Not scrubbed.** Neither variable matches any pattern in `ENV_SCRUB_PATTERNS` (`src/sandbox/paths.ts`), so an ambient `TAVILY_API_KEY` survives the scrub and a configured token file takes precedence over it, exactly as for `KILO_API_KEY`. No edit to `paths.ts`.
- **Row order and comments.** The two rows go after the `gemini` row, `tavily` first, so table order matches the registry's catalog order. Each row has a short comment in the style of the existing rows: which web search provider reads the key, that the search runs in the Janissary process rather than in the spawned process, and that the variable is set for spawned processes only because every non-GitHub row's is (user decision).

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| Token table and loader | `src/project/tokens.ts` (`PROJECT_TOKENS`, `readToken`, `loadProjectTokens`, `getProjectTokens`, `ProjectTokenName`, `ProjectTokens`) | Two new rows; the loader, the derived `ProjectTokenName` union, and the whitespace rule apply unchanged. |
| Env injection | `src/sandbox/environment.ts` (`tokenVariables`, used by `workspaceCredentialEnv` and `agentCredentialEnv`) | Sets `TAVILY_API_KEY` and `TINYFISH_API_KEY` with no edit. |
| Remote forwarding | `src/remote/entry-factory.ts` (`tokens: getProjectTokens()` on `provision`), `src/remote/serve-provision.ts` (`{ ...own, ...forwarded }`), `src/remote/frame/decode-provision.ts` (`TOKEN_NAMES` from the table) | Forwards and accepts the two names with no edit. |
| Version-bump precedent | `src/remote/protocol.ts` (the "Version 33 adds the `kilo` name" comment above `REMOTE_PROTOCOL_VERSION`), `product/specs/remote-server.md` ("Protocol version 33 adds the Kilo key's name") | Shape of this slice's bump comment and spec paragraph. |
| Table-driven tests | `src/project/tokens.test.ts` (`it.each(PROJECT_TOKENS)` project and home reads; "names each environment variable on exactly one row") | Already exercise the new rows; extended only where noted below. |

## Proposed changes

Land code, tests, and docs in one commit; the code is two files and nothing compiles against the new names until `web-search-5`.

- **`src/project/tokens.ts`** — two rows appended after `gemini`: `name: 'tavily'`, `file: 'tavily-token'`, `env: ['TAVILY_API_KEY']`, and `name: 'tinyfish'`, `file: 'tinyfish-token'`, `env: ['TINYFISH_API_KEY']`, with the same three fields every row has and the comments described above. The file stays far under 200 lines.
- **`src/remote/protocol.ts`** — `REMOTE_PROTOCOL_VERSION` one past its current value, with the comment described above appended to the version history block.
- **`product/specs/workspaced-agent.md`** — every enumeration of the token files gains `tavily-token` and `tinyfish-token`: the remote-launch forwarding list ("`.janissary/github-token`, … and `.janissary/gemini-token` are all forwarded"), "Each of the five credential files" under "Where token files are read from" (now seven), and "The four harness credentials … also reach an ACP agent that runs outside any workspace" (now six, with `TAVILY_API_KEY` and `TINYFISH_API_KEY`). Add a short paragraph naming both files, their variables, that the web search reads them, the project-then-home rule, and the restart note.
- **`product/specs/remote-server.md`** — add both names to the forwarded-credentials paragraph ("The local project's `.janissary/claude-token`, … travel the same way"), and add a "Protocol version 43 adds…" paragraph after the version-42 one, shaped like the version-33 paragraph. `web-search-7` edits other paragraphs of this spec.
- **`product/specs/acp.md`** — the sentence at "An agent outside a workspace … receives the configured `claude-token`, `opencode-token`, `kilo-token`, and `gemini-token` credentials" gains the two files. `web-search-12` edits other parts of this spec.
- **`documentation/user-documentation/advanced-agents/tokens.md`** — "reads five optional token files" becomes seven, the table gains `tavily-token` and `tinyfish-token` rows ("web search through Tavily/TinyFish", set it up when you want `web search` to use that provider), and "the four harness tokens" and "All five token files" become six and seven. The `src/project/tokens.ts` header ("Adding one is a row here plus its spec and documentation") makes this page part of adding a row. `help web`'s setup section stays in `web-search-10`.

## Tests

- **`src/project/tokens.test.ts`** — the existing `it.each(PROJECT_TOKENS)` cases already read each new file from the project and from home, and the uniqueness case checks the new variables; add one case that, in a single load, takes `tavily-token` from the project over a different home copy and `tinyfish-token` from home, and a whitespace-only project `tavily-token` falls back to the home copy.
- **`src/sandbox/environment.test.ts`** — extend "maps every harness token to each variable its row names" so the input includes `tavily` and `tinyfish` and the expected record includes `TAVILY_API_KEY` and `TINYFISH_API_KEY`; the existing "adds nothing when no token is configured" case covers neither being set.
- **`src/sandbox/index.test.ts`** — beside "still injects the Kilo credential for a workspaced spawn when nothing is confined", a workspaced `sandboxSpawn` with `tokens: { tavily, tinyfish }` sets both variables (the `workspaceCredentialEnv` path).
- **`src/remote/protocol.test.ts`** — add `tavily` and `tinyfish` to the `provision` frame in "round-trips every client frame"; the existing "provision with an unknown token" case still refuses `other`; the `expect(REMOTE_PROTOCOL_VERSION).toBe(42)` assertion becomes 43.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual: put a value in `~/.janissary/tavily-token`, start `node bin/janus.mjs --no-open <scratch project>`, open a workspaced shell, and confirm `echo $TAVILY_API_KEY` prints it and `echo $TINYFISH_API_KEY` prints nothing.

## Out of scope

- Reading tokens on each search (the named upgrade path, not built).
- Any provider, registry, or command code that reads the tokens (`./product/plans/complete/web-search-4-bundled-providers.md` onward).
- Passing the merged tokens to the remote file-navigator operation context (`./product/plans/complete/web-search-8-remote-port.md`) and to the far-side ACP loop (`./product/plans/complete/web-search-11-workspace-routes.md`).
- The `web-search` operation's own protocol bump (`./product/plans/complete/web-search-7-remote-operation.md`).
- `help web`'s token setup section (`./product/plans/complete/web-search-10-typed-command.md`).
- Keeping the two keys out of harness and agent environments (user decision: they reach every process the table reaches).
