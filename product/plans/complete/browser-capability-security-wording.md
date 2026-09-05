# Correct browser capability and live-session security claims

**Complexity: 3/10** - the implementation is documentation-only, but the wording must distinguish disclosure reduction from an enforced isolation boundary across several configurations.

## Issue

The sandbox specification calls the guarded browser endpoint non-credential data even though its unguessable path authorizes control of one browser. Other browser documentation treats the absence of an injected live Janissary URL and token as proof that the harness cannot reach the user's session, including configurations where the harness is not confined and may discover same-user process or listener state itself.

## Approach

Classify the endpoint as a scoped bearer capability and the Playwright module location as a non-secret path. State consistently that Janissary withholds the live application URL and token, and that active workspace confinement blocks the normal route through project state. Treat those as reduced disclosure rather than a universal reachability guarantee, cross-referencing the existing warnings for hosts without Seatbelt, disabled workspace isolation, and `--no-workspace` launches. Preserve the intended workflow of testing the workspace's own server.

## Implementation

1. Correct the environment-variable classification in `product/specs/sandbox.md` and state that the browser endpoint must be protected as a scoped bearer capability.
2. Qualify the live-session non-injection claim in `product/specs/harness.md` and point to the sandbox configuration limits.
3. Apply the same distinction in the public harness documentation and runtime browser guide, retaining the instruction to test the workspace's own server.
4. Update PR #975's `What` section with the same scoped claim and cross-reference its existing configuration warning.
5. Search all affected material for the inaccurate non-credential and unreachable-session claims, then remove the final backlog entry and delete the empty backlog file.

## Tests

Inspect the final diff and search the affected documents for the old claims. Run `./scripts/run.mjs check-diff`; no runtime tests are required because behavior and credential handling do not change.

## Documentation

Update the sandbox and harness specifications, public harness guide, runtime browser guide, and PR description. No help text changes because command syntax and behavior are unchanged.

## Out of scope

- Changing environment construction, token handling, sandbox profiles, or browser transport.
- Claiming the guarded endpoint is equivalent in scope to the live Janissary application token.
- Adding confinement to unsupported or explicitly unconfined configurations.

## Verification result

The sandbox specification now distinguishes the non-secret Playwright filesystem path from the protected endpoint whose unguessable path authorizes control of one contained browser. The harness specification, public guide, runtime guide, and PR `What` section all state that Janissary withholds the live URL and token and that active workspace confinement blocks the normal project-state route, without treating either fact as proof of unreachability on hosts without Seatbelt, with `sandboxWorkspaces` off, or under `--no-workspace`. Each keeps the own-workspace server as the intended target and points to the existing configuration warnings. Searches find none of the old non-credential or no-other-route claims. `./scripts/run.mjs check-diff` has no code checks to select for this documentation-only diff.
