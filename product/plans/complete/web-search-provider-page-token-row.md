# Give the provider reference page an example token row of its own

**Complexity: 1/10** — a docs-only correction to one page; no production file, test, or behavior changes.

## Goal

`documentation/developer-documentation/web-search-providers.md` must not teach a new provider to name Tavily's token row. Its `exampleManifest` snippet currently sets `token: 'tavily'`, which is a valid `ProjectTokenName`, so it typechecks and looks correct while giving the hypothetical `example` provider Tavily's API key. A reader who copies it gets a provider that receives the wrong credential, and `auto` treats the new provider as configured whenever the Tavily token file exists. The page also never says that a provider's `token` names a row in `PROJECT_TOKENS`, or that a new provider needs its own row.

## Issue

Recorded on PR #2010's branch backlog, severity 5/10:

> The page's "Files to add" example gives the hypothetical `example` provider `token: 'tavily'` and never says a new provider needs its own `PROJECT_TOKENS` row, so a provider author following the reference would hand Tavily's credential to a different service and auto-selection would treat the new provider as configured whenever the Tavily token exists.

The mistake is invisible to typechecking because `'tavily'` is a valid `ProjectTokenName`. The compatibility test also uses `token: 'tavily'` on the frozen `fixture-v1` manifest, but only as a test stand-in whose value the test supplies; that manifest is not a model for a real provider and must stay unchanged.

## Approach

Correct the page in place, leaving the fixture manifest and its compatibility test untouched:

1. Label the `fixture-v1` example's `token: 'tavily'` as a test stand-in, so a reader does not copy the fixture's choice into a real provider.
2. Change the `exampleManifest` snippet to `token: 'example'`, a placeholder for the row the page adds, and say plainly that reusing another row hands the new provider that service's key.
3. Add a "Token rows" section after the manifest reference. It explains that `token` names a row in `PROJECT_TOKENS` in `src/project/tokens.ts`; that a new provider needs a new row with its own `name`, `file`, and `env`; that adding a row also needs the matching specs and user documentation; and that a row forwarded to remote machines moves `REMOTE_PROTOCOL_VERSION`.
4. Point the manifest reference's `token` row at that section.

Then re-read the page and confirm every token literal either names an existing `ProjectTokenName` (`'tavily'`, `'tinyfish'`, `'github'`, `'claude'`, `'opencode'`, `'kilo'`, `'gemini'`) or is explicitly presented as a placeholder (`'example'`).

## Design decisions

- **Keep the fixture and compatibility test byte-for-byte.** `src/web-search/fixture-v1/manifest.ts` and `src/web-search/fixture-v1/compatibility.test.ts` are the frozen API v1 pin. Changing the fixture's `token` to a placeholder would either break the type contract or weaken the pin, so the page explains the stand-in instead.
- **Use `'example'` as the placeholder, matching the provider id.** The snippet already names the provider `example`, so `token: 'example'` reads as the row to add. A comment beside it and the new section label it as a placeholder, satisfying the rule that every token literal names a real `ProjectTokenName` or is explicitly a placeholder.
- **Name the concrete places a row touches, without turning the page into a token guide.** `src/project/tokens.ts` says adding a row is "a row here plus its spec and documentation"; the page names the four specs that enumerate the token files today (`workspaced-agent.md`, `sandbox.md`, `remote-server.md`, and `acp.md`) and the user documentation table in `documentation/user-documentation/advanced-agents/tokens.md`.
- **Describe the remote bump as unconditional.** Every `PROJECT_TOKENS` row that `getProjectTokens()` loads is sent on the `provision` frame, and `src/remote/serve-provision.ts` merges it for the clone, the processes, and ACP — the GitHub row included, since the clone reads `tokens.github` from that same merged map. Because a remote decodes the provisioning token map against its own table and refuses an unknown name, every new row moves `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts`.

## Proposed changes

Only `documentation/developer-documentation/web-search-providers.md` changes:

- **"Smallest working example"** — after the `fixtureV1Manifest` snippet, one sentence: `fixture-v1` is the frozen test provider, so its `token: 'tavily'` is a test stand-in whose value the compatibility test supplies, not a row for a real provider.
- **"Files to add"** — change `token: 'tavily'` to `token: 'example'` in `exampleManifest`, with a short comment naming it the placeholder row added below. Add one sentence before the snippet: the snippet's `token` names a row the provider author adds to `PROJECT_TOKENS`, and reusing another provider's name would hand the new provider that service's key.
- **"Manifest reference"** — extend the `token` row's Meaning cell: the `ProjectTokenName` of the token file whose value becomes `capability.apiKey`, and a new provider needs its own row; link to "Token rows".
- **"Token rows"** (new section between "Manifest reference" and "The provider module") — the rule and the `example` row:

  ```ts
  {
    name: 'example',
    file: 'example-token',
    env: ['EXAMPLE_API_KEY'],
  },
  ```

  Plus prose that adding a row also updates the matching specs and user documentation (`product/specs/workspaced-agent.md`, `documentation/user-documentation/advanced-agents/tokens.md`, and any other spec that enumerates the token files), and that a forwarded row moves `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts`.

No source, test, config, or user-documentation change is needed. No spec update is needed either: this corrects a developer reference page without changing behavior, and the behavior spec for the web search feature is still deferred to `./product/plans/complete/web-search-10-typed-command.md`.

## Tests

No automated test covers page prose. The existing fixture compatibility test must keep passing unchanged, and the page is verified by reading it:

- `src/web-search/fixture-v1/manifest.ts` is unchanged (`token: 'tavily'`).
- `src/web-search/fixture-v1/compatibility.test.ts` is unchanged.
- Every `token:` literal in the page is either an existing `ProjectTokenName` or explicitly labeled a placeholder.
- The new section's `name`, `file`, and `env` values follow the existing rows' shape and naming.

## Verification

- `$janissary/scripts/run.mjs check-diff` (docs-only; no source or test change).
- Read the finished page start to finish and confirm the fixture is labeled a stand-in, the example token is labeled a placeholder, and the token-row rule names `PROJECT_TOKENS` and the remote version bump.

## Out of scope

- Changing `src/web-search/fixture-v1/manifest.ts` or its compatibility test; both stay as the frozen v1 pin.
- Adding a real `example` row to `PROJECT_TOKENS`, a real provider, or its specs and user documentation; this page only describes what a provider author must do.
- The two other provider-reference documentation entries still recorded on the branch backlog (disabled-provider resolution lines and expected-failure fallback).
- The activation-failure fix in `src/web-search/registry.ts`.
