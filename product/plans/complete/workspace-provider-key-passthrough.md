# Say which provider variables actually reach a workspaced harness

**Complexity: 2/10** — no behavior change. A comment, a widened test, and three prose corrections to guidance that is currently wrong in a way that will waste someone's afternoon.

Denying `~/.local/share/opencode/auth.json` left one escape hatch for opencode's non-OpenCode providers: put the provider's key in the environment janissary is started from, which the scrub deliberately passes through. The spec and the user documentation both describe that hatch as `GEMINI_API_KEY`/`GOOGLE_*`.

`GOOGLE_*` is wrong, and wrong in the worst direction — it names a variable that looks like it should work and doesn't. The models catalog opencode reads declares two separate Google providers:

- `google` — `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_API_KEY`. Literal keys. All three survive the scrub and reach the harness, so the guidance holds.
- `google-vertex` (and `google-vertex-anthropic`) — `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`. The last is a *path to a file*, not a key. The variable itself survives the scrub, so everything looks configured, but the file it names is unreadable inside the workspace whenever it sits under `$HOME` outside a carve-in — and its default location, `~/.config/gcloud/application_default_credentials.json`, is an explicit `SECRET_DENY_PATHS` entry. Exporting the variable authenticates nothing.

Nothing about the sandbox needs to change for this. What needs to change is that we currently tell people to do something that cannot work, with no hint about why it fails.

## Approach

**Distinguish a key from a path, everywhere the escape hatch is described.** A variable carrying the credential itself crosses into a workspace intact. A variable carrying a *filename* only works if that file is also readable inside the sandbox, which for credential files is deliberately not the case. That distinction is the whole content of this change, and it belongs in the three places that currently blur it: the scrub comment in `paths.ts`, the environment-scrubbing section of `product/specs/sandbox.md`, and the harness-authentication guidance in `product/specs/workspaced-agent.md` and `documentation/user-documentation/advanced-agents/tokens.md`.

**Pin the pass-through with tests rather than trusting the absence of a pattern.** The scrub test currently asserts three provider keys survive; `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` — the two the affected provider actually reads — are not among them, so nothing would catch a future scrub pattern that swallowed them. They go in the keep-list. `GOOGLE_APPLICATION_CREDENTIALS` goes in too, asserted to survive, because the point being pinned is precisely that surviving the scrub is not sufficient.

**No sandbox carve-in for the ADC file.** Carving `~/.config/gcloud` back in to make vertex work would hand a workspaced agent a Google credential file, which is the thing the deny list exists to prevent. A vertex user's answer is an API-key provider or a key in the environment, not a wider sandbox.

## Implementation steps

1. `src/sandbox/paths.ts` — extend the `ENV_SCRUB_PATTERNS` comment: name the provider variables that are exempt and reach a harness intact, and add the caveat that a variable naming a credential *file* (`GOOGLE_APPLICATION_CREDENTIALS`) passes the scrub but resolves to a path the sandbox denies.
2. `src/sandbox/index.test.ts` — add `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_VERTEX_PROJECT`, and `GOOGLE_APPLICATION_CREDENTIALS` to the keep-list in the existing scrub test, and assert each survives. Add a comment on the last one recording that its survival is necessary but not sufficient.
3. `product/specs/sandbox.md` — in "Environment scrubbing", replace the `GEMINI_*`/`GOOGLE_*` shorthand with the real variable names and state the key-versus-path distinction.
4. `product/specs/workspaced-agent.md` — correct the provider-variable list in the opencode paragraph, which currently reads `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_*`, and note that a vertex-configured opencode has no working route inside a workspace.
5. `documentation/user-documentation/advanced-agents/tokens.md` — same correction in the user-facing wording, naming the variables to set and saying plainly that the Vertex file-based credential is not usable from a workspace.

## Tests

- `src/sandbox/index.test.ts`, extending the existing scrub test: `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, and `GOOGLE_VERTEX_PROJECT` reach a confined workspaced spawn unchanged, alongside the three provider keys already asserted; `GOOGLE_APPLICATION_CREDENTIALS` reaches it too, which is what makes its failure mode confusing enough to be worth documenting.

No new test file: this pins existing behavior in the test that already owns the scrub's keep/drop contract, rather than starting a parallel one.

## Out of scope

- **Carving `~/.config/gcloud`, or any credential file, back into the sandbox** — see the Approach note.
- **A `.janissary/` token file for opencode's other providers.** `OPENCODE_API_KEY` covers Zen and Go by design; a per-provider credential store for everything opencode can talk to is a different feature with a different shape.
- **Changing `ENV_SCRUB_PATTERNS`.** The patterns are correct; only their documentation is wrong.
- **codex and claude provider variables.** Neither reads its credential from an environment variable naming a file, so the distinction this change draws does not arise for them.

## Verification

Automated: `./scripts/run.mjs check-diff`, plus `npm run docs:build`.

Manual: with `GEMINI_API_KEY` exported in the shell janissary is started from, open a workspaced opencode harness and confirm the Google provider answers; confirm that exporting only `GOOGLE_APPLICATION_CREDENTIALS` does not.
