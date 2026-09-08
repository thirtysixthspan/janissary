# Read token files from `~/.janissary`, with the project's own `.janissary` overriding them

**Complexity: 3/10** — one changed function in one module, an injectable home directory following a pattern already used twice, and the test updates that keep the suite hermetic. No new architecture, no protocol change, no sandbox change.

Every credential janissary hands a workspaced tab comes from a file in the project's `.janissary/` directory: `github-token`, `claude-token`, `opencode-token`, `gemini-token`. That is one copy of each credential per project. A GitHub PAT scoped to a user's repositories, a Claude subscription token, an OpenCode key — none of those is really a fact about one project, and copying them into every checkout means four files to provision on every new clone and four places to update when one is rotated.

The credentials should live once in `~/.janissary/`, where they serve every project on the machine, and a project that needs something different should be able to say so by dropping its own file in `.janissary/`.

## Approach

**Project first, home second.** `readToken` already builds `<dir>/.janissary/<file>`; it takes the directory it reads under as an argument rather than assuming the project. `loadProjectTokens` asks for the project's file, and falls back to the home one only when the project has nothing to give. That ordering is the whole of the override: a project file wins because it is consulted first, not because anything compares the two.

**A file with nothing in it is a file that gives nothing.** `readToken` already treats a missing file and a whitespace-only file as the same answer — `undefined` — and that stays true across both locations. So an empty project token file falls through to the home one exactly as an absent one does. The alternative, letting an empty project file suppress a home credential, would be a second meaning for a state the loader currently has one meaning for, and nothing in the request asks for a way to opt a project out.

**The home directory is a parameter with a default.** `loadProjectTokens(projectDir, home = homedir())`, matching `initGlobalHistory(home?)` and `ConversationStore({ home })`, which take the same shape for the same reason. Production callers (`main.ts`, `runRemoteServer`) pass nothing and get the real home; tests pass a temporary directory and stop depending on whatever the machine running them happens to have in `~/.janissary`. Without that seam the existing "omits a token whose file is missing" test would pass or fail according to the developer's own credentials.

**Both ends of a remote resolve their own home.** `runRemoteServer` loads tokens on the far machine, so the remote's `~/.janissary` becomes part of the fallback the spec already describes — "the remote project's own file when nothing is sent" widens to the remote machine's own file. Nothing about forwarding changes: the provisioning frame still carries whatever the initiating end loaded.

**No sandbox change.** The janissary server process reads these files and injects their values as environment variables; a sandboxed process never opens them. `~/.janissary` is not in `HOME_READ_CARVEINS`, so the `$HOME`-wide read deny already covers it — the home copy is exactly as unreachable from inside a workspace as the project copy is.

**Launching from the home directory reads one file twice.** When `projectDir` is `~`, both candidates are the same path and the project read answers first. Harmless, and cheaper to leave than to special-case.

## Implementation steps

1. `src/project/tokens.ts` — `readToken` takes the containing directory rather than the project directory (a rename and a comment, not a behavior change); `loadProjectTokens` gains a `home` parameter defaulting to `homedir()` and asks the project first, the home second. Update the table's header comment, which says each credential is "one row per file under `.janissary/`", to name both locations.
2. `src/project/tokens.test.ts` — give the existing tests an isolated home so none of them consults the real one, then add the cases below.
3. `src/remote/serve.test.ts` — pass the same kind of isolated home to the six `loadProjectTokens(repoDir)` calls, so the remote fallback tests keep asserting the remote *project's* file and not the developer's.
4. `product/specs/workspaced-agent.md` — a subsection under the credentials material stating where token files are read from and which one wins.
   `product/specs/remote-server.md` — its two "the remote project's own file is the fallback" clauses widen to the remote machine's two locations, and point at the new subsection rather than restating it.
5. `documentation/user-documentation/advanced-agents/tokens.md` — the page opens by saying the files are read from the project's `.janissary/`; correct that to both locations and say which wins.
6. `documentation/user-documentation/workflows/creating-a-new-project.md` — the GitHub-token step says to save the token in the project root; note the home option in the same breath.

## Tests

`src/project/tokens.test.ts`, extended:

- reads `~/.janissary/<file>` into each token when the project has no file of its own (table-driven, like the project case above it)
- the project's file wins when both exist
- the home file is used when the project's holds only whitespace
- a token absent from both places stays out of the record
- one load can mix sources: a project file for one credential, a home file for another
- a second load replaces the cache when the first project's credential came from home

`src/remote/serve.test.ts` keeps its existing assertions, now against an isolated home.

## Out of scope

- **A way to suppress a home credential for one project.** An empty project file falls through, as it always has. Nothing asks for an opt-out, and inventing one here would put a second meaning on a file state the loader reads one way everywhere else.
- **Any other `.janissary/` file.** `config.json`, `agent-names.json`, `harness-models.json`, `interactive-commands.json` and the rest stay project-only. The request names the token files, and a credential's case for living in home — it belongs to the person, not the checkout — is not a general one about project state.
- **Writing or provisioning `~/.janissary/`.** Janissary reads these files and never creates them, in either location.
- **Re-reading on change.** Tokens are still loaded once at startup, from both locations.

## Verification

`./scripts/run.mjs check-diff` after each step.
