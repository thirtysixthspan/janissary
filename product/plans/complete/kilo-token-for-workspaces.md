# Pass a Kilo token into workspaced tabs

**Complexity: 3/10** — one more row in the project token table, plus the protocol bump that a new row turns out to need. No new architecture: the loader, the sandbox injection, the remote forwarding, and the per-token fallback all walk `PROJECT_TOKENS` already, so the change is the row itself and the places that describe the credential list.

An opencode harness can route through the Kilo gateway, and it authenticates there with a Kilo API key. A workspace cannot read opencode's own credential store, so the key has to arrive by a route the workspace may use, the same way the OpenCode and Gemini keys do. Nothing exports it for a workspaced tab today.

The variable is `KILO_API_KEY`. Kilo's own gateway documentation uses that name in its authentication examples. I could not confirm from opencode's provider catalog which name opencode reads for its Kilo provider, because the catalog is too large to read through the fetch tool. If opencode reads a different name, the injected key goes unused and the tab behaves as it does today, so the risk is a no-op rather than a regression. The implementation notes this in the tokens documentation rather than claiming it.

## Approach

**One row in `PROJECT_TOKENS`.** `src/project/tokens.ts` gains `{ name: 'kilo', file: 'kilo-token', env: ['KILO_API_KEY'] }`. The loader, `workspaceCredentialEnv`, the remote forwarding, and `decodeTokens` all read the table, so nothing else in the local or remote chain names the credential.

**The protocol moves to 33, because a new row is a contract change.** `decodeTokens` in `src/remote/frame/decode-provision.ts` refuses any token name outside the table. A version-32 remote therefore rejects the whole `provision` frame as malformed whenever a Kilo key is forwarded, and the tab fails to provision rather than merely lacking the key. The version rule in `src/remote/protocol.ts` says a field one end fills and the other must honor moves the version, and that is exactly this case. Exact-version refusal at the handshake reports the mismatch before a tab is provisioned.

This corrects a claim the remote-server spec currently makes, that adding a credential "no longer touches the contract at all." That held when the table was introduced only if the decoder ignored unknown names, which it does not. The spec paragraph is rewritten to say a row moves the version, and why.

**Not added to `ENV_SCRUB_PATTERNS`.** `KILO_API_KEY` matches no current pattern and should not: it is an LLM provider key, and the scrub exempts those so harnesses can use their own. An ambient value keeps passing through, and a configured token file takes precedence over it, the same as the OpenCode key.

**Injected for any workspaced spawn**, matching the other provider keys, so an agent tab's shell can reach the gateway too.

**No credential notice.** Same reasoning as the OpenCode and Gemini keys: an unauthenticated harness reports itself in its own output.

## Implementation steps

1. `src/project/tokens.ts` — add the `kilo` row after `opencode`, with a comment in the table's style: what the key is for (the Kilo gateway, reached through opencode), that it is static with no refresh or expiry, and why a workspace needs it as a file rather than an ambient variable.
2. `src/remote/protocol.ts` — bump `REMOTE_PROTOCOL_VERSION` to `33` and add a "Version 33" comment in the existing list: the `provision` map gains the `kilo` name, and a version-32 remote refuses the frame as malformed rather than provisioning without the key.
3. `product/specs/sandbox.md` — in the section listing the credentials set on workspaced spawns, add the Kilo key beside the OpenCode key: `KILO_API_KEY`, from `.janissary/kilo-token`, on the same terms, off the scrub list, with no companion variable.
4. `product/specs/workspaced-agent.md` — list `kilo-token` in the "Where token files are read from" credential list and the forwarding sentence; add a short paragraph under "Harness authentication" saying an opencode harness routed through the Kilo gateway uses `KILO_API_KEY` from `.janissary/kilo-token`, from the environment, or from its own saved login.
5. `product/specs/remote-server.md` — add the Kilo key to the forwarded-credentials paragraph; rewrite the closing paragraph about the provisioning map so it says a new credential row moves the version, since a remote on the previous table refuses the map. Add the version-33 sentence to the version history.
6. `documentation/user-documentation/advanced-agents/tokens.md` — update the count from four token files to five, add a `kilo-token` row to the file table, and change "All four token files" to "All five" in the remote section. No new section: the page documents files and where they go, and a full "Get a Kilo key" walkthrough would be new documentation for a provider the page does not otherwise cover.

## Tests

- `src/project/tokens.test.ts`: no new cases. The table-driven tests already cover every row loading and trimming its own file from the project and from home, and the single-row-per-variable test already guards `KILO_API_KEY` against a clash.
- `src/sandbox/index.test.ts`: `injects KILO_API_KEY when a kilo token is configured` (confined path, skipped without sandbox support); `still injects the Kilo key for a workspaced spawn when nothing is confined`; `leaves an ambient KILO_API_KEY in place when no kilo token is configured`; the all-tokens case gains `kilo` and its assertion.
- `src/remote/protocol.test.ts`: the pinned version moves from 32 to 33. The existing `it.each` over older versions already covers a version-32 refusal naming both versions.

## Out of scope

- **Confirming opencode's own environment variable for its Kilo provider.** The spec and documentation describe what janissary injects. Verifying the name against opencode would take a live call or a catalog read this change does not make.
- **Setting `KILOCODE_API_KEY` as well.** Another tool's documentation uses that name. Setting an unconfirmed second variable is speculation, and the gemini row's two variables were each confirmed against opencode's behavior.
- **A UI or command for creating the token file.** Janissary only reads it, as with the others.
- **The stale `src/project-tokens.ts` path in `sandbox.md`.** It predates the registry move and is unrelated to this credential.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step. The documentation edits are prose-only and do not touch the VitePress config, so no docs build is needed during development.
