# Resolve saved names for remote shell and harness launches

**Complexity: 6/10** — ~94 added production lines across 4 existing files, 15 scenarios (p=5.791)

## Goal

Let `shell on <name>` and `harness on <name>` use the effective catalog. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-2-effective-file.md` and `product/plans/ready/hosts-tab-4-parked-endpoint.md`.

## Implementation

Add pure `resolveSavedHost(token, hosts)` in `src/remote/saved-host.ts`, next to `parseRemoteAddress` in `src/remote/address.ts:41`. Use the catalog's name guard and case-insensitive comparison. A bare name with an exact match supplies the SSH destination including the optional user, the bare host, path, port, and stored name as `hostName`. Keep the resolved `[user@]host[:path]` in `address` for live channel metadata and parked record reconstruction. A missing saved path preserves remote workspace discovery from the login directory. Update the `RemoteAddress` field comments to describe the resolved address and caller-supplied saved metadata.

Export `resolveRemoteLaunchAddress(managers, originLabel, parsed)` from the same module for the three `on` executors. Skip the catalog for a qualified `@` or `:` token. For a bare candidate, call `readHostsFile` with `managers.tab.launchDir`, `homedir()`, and a callback that forwards the catalog's shared, deduplicated `Hosts file <path> is unusable: <problem>.` through `notify(managers, 'manual', originLabel, message)` in `src/notifications/index.ts:194`. Return the original parsed address for an unusable catalog or unmatched name. A valid home catalog can supply a match after a malformed project override is reported. Keep the helper in core so the plugin imports and capability declarations stay as they are.

- In `src/plugins/launch-tab-remote.ts:35` (`launchRemotePluginTab`), resolve after successful parsing on the new-address branch with `input.origin.label`. Capture the resolved object in the name-refusal retry closure and reuse it when retrying allocation. Use that address for channel setup and its concrete host for the ready callback and error reporting. Keep adopted and joined launches on their existing paths. Extract the addressed launch branch if the added plumbing would cross the 200-line limit.
- In `src/harness/manager.ts:68` (`HarnessManager.run`), resolve `parsed.remote` once after the launch form and model checks. Attribute the catalog notification to `invocation.caller.label` when present and the current tab otherwise. Pass the resolved address through `open` to `SpawnTabOptions.remote`. The retry in `open` already closes over its launch descriptor, so channel setup, placeholder metadata, and retry share the resolved endpoint. `attachRemote` continues using the address reconstructed from the parked record.

Keep `findRemoteClause` and the address grammar pure. In `src/harness/command-parse.ts:74` (`splitWithClause`), preserve the span of the first recognized `on` operand before the trailing prompt and skip a `with` match inside that span. Preserve the prompt text and spacing for a genuine `with` clause. Ignore the same operand when `findGroupClause` and `parseHarnessFlags` scan for independent group, flag, or `as` keywords. Existing option values keep their token positions. This allows saved operands such as `with`, `build-with-ssh`, `as`, and `--offline` to reach the executor without becoming prompt delimiters, labels, or flags. Keep the shell plugin's `remote: { address }` request and parsed launch input unchanged.

## Tests and verification

Cover exact case-folded matching, qualified literals, saved SSH user, port and path, login-directory discovery, project-to-home fallback, and shared notification deduplication in `src/remote/saved-host.test.ts`. Extend `src/harness/command-parse.test.ts` for keyword-like operands, a real trailing prompt, and a prompt containing `on`. In `src/plugins/launch-tab-remote.test.ts` and `src/harness/manager.test.ts`, assert the saved endpoint reaches initial channel creation and remains the same on a name-refusal retry even if the catalog changes. Keep checks for existing literal launch inputs and missing remote operands. Update `product/specs/remote-server.md` with literal precedence, fallback and saved-port behavior. Run `$janissary/scripts/run.mjs check-diff` and try a scratch shell and harness launch with `on lab` against a fixture host that listens on the saved port.

## Out of scope

Agent workspace reuse and file/UI editing.
