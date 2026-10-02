# Bind a member's workspace once, with no assertion

**Complexity: 1/10** — one local binding, replacing a type assertion. The fail-open half of the finding was closed by the preceding fix; what is left is the assertion that hides it.

## Goal

The one code path in the application that approves an agent's own tool calls still carries a `as string` assertion on the member's directory, and passes that directory twice — once as the process's `cwd` and once as the `workspaceDir` the sandbox confines it to.

The fail-open fallback this finding was written about — `cwd: member.dir ?? process.cwd()`, which would have spawned an unconfined agent in the server's own working directory — is gone. `confinementFailure` refuses a member with no directory before any session is opened, so the assertion is now asserting something the code has already established rather than narrowing a real possibility.

What remains is the shape. An assertion is a promise the compiler cannot check, on the single most security-sensitive line in the feature: it says "the check above proved this", and a future edit that reorders those two statements would compile silently and put an unconfined agent back. Binding the directory to a local once, after the check, makes the two uses the same value by construction and lets the assertion go.

## Approach

Have `confinementFailure` hand back the directory it validated rather than only the reason it failed, so `connect` binds one local and uses it for both `cwd` and `workspaceDir`. The value the sandbox confines and the value the process starts in then cannot come apart, and nothing is asserted.

## Implementation steps

1. In `src/multiagent/sessions.ts`, change the helper to return the member's directory when the member can be confined and the reason when it cannot, so one call yields both facts.
2. In `connect`, bind that directory to a local and pass it as both `cwd` and `workspaceDir`. Remove the `as string`.
3. Leave the refusal branch exactly as it is: it marks the member failed, announces it, and opens nothing.

## Tests

The behaviour this changes is already covered and must keep passing:

- `src/multiagent/sessions.test.ts` already asserts that a member with no `dir` is not spawned and reads `failed`, and that the per-member `cwd` and `workspaceDir` are that member's own directory. Those two cases are the ones that would catch a regression here.
- Add one case asserting a single member's spawned options carry the same value for `cwd` and `workspaceDir`, which is the property the binding now guarantees by construction.

## Out of scope

- **The confinement decision itself**, which is settled and tested by `multiagent-own-tools-requires-confinement`.
- **Distinct workspace names**, which is the next backlog entry.

## Verification

```
./scripts/run.mjs check-diff
```

No manual step: this changes no behavior on any path the tests reach, and the refusal path it hardens is the one the preceding fix introduced.
