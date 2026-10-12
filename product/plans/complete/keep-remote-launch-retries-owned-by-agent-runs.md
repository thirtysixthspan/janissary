# Keep remote launch retries owned by agent runs

**Complexity: 7/10** — Remote refusal callbacks outlive initial launch admission, so preserving run identity, admitting retries, and proving cleanup ordering crosses the plugin launch and run lifecycle boundaries. The requested complexity cutoff is waived for this selected PR entry.

## Goal

Keep a default-name remote plugin launch retry within its originating agent run, refusing retries once the run ends and ensuring admitted replacement tabs are registered before run cleanup proceeds.

## Approach

Carry the optional originating run ID through `RemoteNameRetry` and make its relaunch callback accept the run allocation's registration function. For known agent runs, the remote refusal funnel checks that the run is still live and invokes the retry through `withRunAllocationAsync`; the retry registers its replacement tab before completing. Retries without a known agent-run owner keep their direct behavior.

## Implementation steps

1. Add run identity and registration-aware relaunch behavior to `RemoteNameRetry`, and preserve it when `launchRemotePluginTab` creates the callback.
2. Admit known-run retries with `withRunAllocationAsync`, stop them after run termination, and keep unowned retry behavior unchanged.
3. Add remote launch tests for a refusal delivered after termination, an admitted retry whose registration delays cleanup, and unowned retry compatibility.
4. Update the agent run-ownership spec and remove only this completed entry from the PR backlog.

## Tests

- Extend remote plugin launch lifecycle tests to prove a late refusal opens no replacement after run termination.
- Prove a retry admitted before termination registers the replacement and run cleanup waits for admitted work and closes the replacement.
- Retain the existing unowned default-name retry test.

## Out of scope

Do not change harness retry ownership, explicit-name refusal behavior, remote launch retry limits, plugin APIs, or unrelated backlog entries.
