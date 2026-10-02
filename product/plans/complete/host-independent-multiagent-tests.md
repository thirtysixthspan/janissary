# Make the multi-agent tests independent of the host's workspace isolation

**Complexity: 2/10** — one missing mock, one exported predicate, and the count it feeds. The production behavior was already right; the tests were reading the machine, and the count was reporting a run that could not happen.

## Goal

Four cases in `src/multiagent/manager.test.ts` passed on a Mac and failed on the Linux runner, and the reason is the platform limit this feature carries.

A member is only connected once its spawn is known to be confined, and `confinableDir` in `src/multiagent/sessions.ts` asks `sandboxNotice`, which reports isolation unavailable on any host without `/usr/bin/sandbox-exec`. `manager.test.ts` mocked `../acp/index.js` but not `../sandbox/index.js`, so on CI every member was refused, `connectAcp` was never called, and four assertions about prompting, offline propagation and teardown failed with it. `sessions.test.ts` and `profile/manager.test.ts` both mock that module; this one file was missed.

That is the whole of the CI failure, and it was proved rather than inferred: stubbing the notice to report isolation unavailable reproduces exactly those four failures on this machine.

## Approach

Two changes, and the second was found by the first.

**Mock the sandbox module in `manager.test.ts`**, following the pattern the two sibling test files already use, with a `beforeEach` resetting the notice to "isolation available". These cases then assert the manager's orchestration rather than where they happen to be running.

**Stop counting a member that cannot be confined as running.** Writing the case that pins the Linux behavior surfaced a real inaccuracy: `run` reported `running: 1` for a member it was about to refuse. The count is taken synchronously after provisioning, while the refusal only happens when the clone lands and `connect` runs — so on a host without isolation every `fanout` printed "Comparing N models" above N rows that immediately read `failed: workspace isolation unavailable`.

The confinement verdict depends only on the host and on the member's own workspace, and both are known before the clone lands, so it is knowable at report time. `memberIsConfined` is exported from `sessions.ts` and derived from `confinableDir`, so the connection path and the count cannot answer the same question differently — the drift `confinableDir`'s own comment warns about.

## Implementation steps

1. Add `sandboxNotice` to the hoisted mocks in `src/multiagent/manager.test.ts`, mock `../sandbox/index.js`, and reset it to `undefined` in the `beforeEach`.
2. Export `memberIsConfined` from `src/multiagent/sessions.ts`, implemented as `'dir' in confinableDir(member)`.
3. In `MultiAgentManager.run`, filter the running count through it, so a member that provably cannot be connected is left out of the reported size.
4. Leave the refusal itself where it is: it still happens when the clone lands, and the member still ends up `failed` with the reason on its row.

## Tests

- `src/multiagent/manager.test.ts` — the four previously host-dependent cases now run against the stub. A new case pins the platform behavior deliberately: with isolation reported unavailable, the run still opens its tab, spawns nothing, reports zero running, and every member reads `failed` with the reason. That case is what would have caught the count overstating itself.
- `src/multiagent/sessions.test.ts` — a case for `memberIsConfined` on both sides of the verdict, and for a member with no workspace.

## Out of scope

- **The refusal itself.** Refusing on a host without isolation is correct and stays.
- **The `help.md` row and the specs**, which already state the condition; only the count's accuracy changes.
- **Any other host-dependent test.** `sessions.test.ts` and `profile/manager.test.ts` already mock the module, and `sessions.ts` is the only non-test reader the branch introduced.

## Verification

```
./scripts/run.mjs pr-check-gate
```

The gate is the check that matters here, because it runs the whole server suite the way CI does; the failure was only ever visible on a host that is not this one, so the proof that it is fixed is that the suite no longer consults the machine. The new manager case, which runs everywhere, is what keeps it that way.
