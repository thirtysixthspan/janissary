# State that every token row is forwarded and always moves the remote protocol version

**Complexity: 1/10** — a docs-only correction: no production lines, files, scenarios, or new units, and one requirement (p=2.07).

## Goal

`documentation/developer-documentation/web-search-providers.md` must tell a provider author that adding a `PROJECT_TOKENS` row unconditionally moves `REMOTE_PROTOCOL_VERSION`. Provisioning forwards every configured row, the GitHub row included, and a remote's decoder rejects an unknown name by failing the whole `provision` frame.

The page's "Token rows" section currently makes the bump conditional: "A row forwarded to remote machines also moves `REMOTE_PROTOCOL_VERSION`". That wording came from `product/plans/complete/web-search-provider-page-token-row.md`, whose design decision calls the GitHub row "workspace-only and is not forwarded". That claim is false for provisioning, so a provider author can read the page as saying some rows are exempt from the version bump.

## Issue

Recorded on PR #2010's branch backlog, severity 4/10:

> The token-row fix plan's design decision says the GitHub row is workspace-only and not forwarded, and the page's "Token rows" section follows it by making the `REMOTE_PROTOCOL_VERSION` bump conditional, while `getProjectTokens()` in `src/project/tokens.ts` supplies every configured row to the provisioning frame sent by `src/remote/entry-factory.ts` and `src/remote/serve-provision.ts` merges `tokens.github` for the clone, the processes, and ACP, so a provider author adding a row is never told the bump always applies.

Verified against the code:

- `src/project/tokens.ts` — `getProjectTokens()` returns the whole loaded `ProjectTokens` record, which `loadProjectTokens` fills by walking every `PROJECT_TOKENS` row. No row is excluded.
- `src/remote/entry-factory.ts` — the `provision` frame carries `tokens: getProjectTokens()`, so the map sent is the table-driven set.
- `src/remote/serve-provision.ts` — `const tokens = { ...own, ...forwarded }`; the workspace clone receives `tokens.github`, and `RemoteProcesses` and `RemoteAcp` receive the merged `tokens`. The GitHub row is forwarded and used exactly like the others.
- `src/remote/frame/decode-provision.ts` — `TOKEN_NAMES` is built from `PROJECT_TOKENS`, and any unknown name makes `decodeTokens` return `undefined`, which turns the whole `provision` frame into `malformed('provision')`.
- `src/remote/protocol.ts` — version 43's comment states the same rule for the Tavily and TinyFish rows.
- `product/specs/remote-server.md` — records the project's GitHub token as forwarded on the provisioning frame, groups the harness credentials "the same way, in the same map on the same frame", and says "Each new credential therefore moves the version".

## Approach

1. Replace the conditional final sentence in the "Token rows" section of `documentation/developer-documentation/web-search-providers.md` with an unconditional one that names the three seams: `getProjectTokens()` supplies every configured row, `entry-factory.ts` sends the map on `provision`, and `serve-provision.ts` merges it for the clone, the processes, and ACP. Keep the consequence: `decode-provision.ts` rejects an unknown name and fails the whole frame, so every new row moves `REMOTE_PROTOCOL_VERSION`.
2. Correct the false design decision in `product/plans/complete/web-search-provider-page-token-row.md`, naming the same forwarding path and stating the bump is unconditional. Leave the plan's other sections unchanged.
3. Re-read the page's "Token rows" section and the corrected design decision against `getProjectTokens`, `entry-factory.ts`, `serve-provision.ts`, and `decode-provision.ts`.

## Design decisions

- **State the rule as the table's property, not a per-row decision.** The forwarding path walks `PROJECT_TOKENS` as a table, so the page should not offer a per-row exemption that the code does not have. "Every new row" is the accurate rule; a row that is never forwarded would be a new behavior, not a current exception.
- **Name the seams that make it unconditional.** `getProjectTokens()` (the whole map), `entry-factory.ts` (the frame), and `serve-provision.ts` (the merge for clone, processes, and ACP) are what a provider author can read to confirm there is no filter. Naming `decode-provision.ts` keeps the reason for the bump attached to the failure it prevents.
- **Correct the completed plan in place.** That design decision is what the page followed, so leaving it would let the same conditional wording return. Only that bullet changes; the plan's goal, approach, tests, and out-of-scope record stay as written.
- **No code or protocol change.** The behavior is already unconditional; only the two documents describing it are wrong. Changing `REMOTE_PROTOCOL_VERSION` now would be a protocol change with no new contract to carry.

## Proposed changes

Only two markdown files change.

- **`documentation/developer-documentation/web-search-providers.md`** — in "Token rows", replace the final sentence ("A row forwarded to remote machines also moves...") with:

  ```markdown
  Every new row also moves `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts`, with no row exempt: `getProjectTokens()` in `src/project/tokens.ts` supplies every configured row to the remote `provision` frame that `src/remote/entry-factory.ts` sends, and `src/remote/serve-provision.ts` merges the forwarded map for the workspace clone, the processes, and ACP. A remote decodes that map against its own `PROJECT_TOKENS` table, and `src/remote/frame/decode-provision.ts` rejects an unknown name by failing the whole provisioning request, so a row a peer does not know breaks provisioning rather than merely going unused.
  ```

- **`product/plans/complete/web-search-provider-page-token-row.md`** — replace the "Describe the remote bump as conditional" design decision with:

  ```markdown
  - **Describe the remote bump as unconditional.** Every `PROJECT_TOKENS` row that `getProjectTokens()` loads is sent on the `provision` frame, and `src/remote/serve-provision.ts` merges it for the clone, the processes, and ACP — the GitHub row included, since the clone reads `tokens.github` from that same merged map. Because a remote decodes the provisioning token map against its own table and refuses an unknown name, every new row moves `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts`.
  ```

No source, test, config, or user-documentation change is needed.

## Tests

No automated test covers page prose, and this fix changes no code. The existing tests that pin the described behavior must keep passing unchanged:

- `src/project/tokens.test.ts` — every row is loaded project-first and home-second.
- `src/remote/serve-provision.test.ts` — `serve-provision.ts` merges forwarded tokens over the remote's own and hands them to the clone, processes, and ACP.
- `src/remote/protocol.test.ts` — the current protocol version and its frame contract.

Verify the prose by reading it:

- The "Token rows" section says every new row moves `REMOTE_PROTOCOL_VERSION`, with no conditional "forwarded row" qualifier.
- The section names `getProjectTokens()`, `entry-factory.ts`, `serve-provision.ts`, and `decode-provision.ts`, and the stated forwarding matches each.
- The corrected design decision no longer calls the GitHub row workspace-only or unforwarded, and it names `tokens.github` as part of the merged map.
- Every `token:` literal in the page still names an existing `ProjectTokenName` or is explicitly a placeholder.

## Verification

- `$janissary/scripts/run.mjs check-diff` (docs-only; no source or test change).
- Re-read "Token rows" and the corrected design decision against `getProjectTokens`, `entry-factory.ts`, `serve-provision.ts`, and `decode-provision.ts`.

## Spec

No `./product/specs/` update. This corrects two documents to match behavior that `product/specs/remote-server.md` already records: the GitHub token is forwarded on the provisioning frame, the other credentials travel the same way in the same map, and each new credential moves the version. The fix introduces no behavior the specs do not already describe.

## Out of scope

- Changing `src/project/tokens.ts`, `src/remote/entry-factory.ts`, `src/remote/serve-provision.ts`, `src/remote/frame/decode-provision.ts`, or `src/remote/protocol.ts`; the forwarding and the version are already correct.
- Bumping `REMOTE_PROTOCOL_VERSION`; no new token row or frame contract is added.
- Rewriting the completed plan's goal, approach, tests, or out-of-scope sections; only the false design decision changes.
- Documenting the GitHub token's workspace-only reach for ACP agents outside a workspace, which `product/specs/acp.md` and `documentation/user-documentation/advanced-agents/tokens.md` correctly describe as a different path.
