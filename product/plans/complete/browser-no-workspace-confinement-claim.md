# Correct the claim that a --no-workspace e2e browser runs unconfined

**Complexity: 3/10** — one specification section, one documentation paragraph, and one new test case. No behaviour changes at all: the code already does the right thing, and the documents describe it wrongly.

## Goal

`product/specs/sandbox.md` lists three cases under "Where confinement does not apply" — a host without Seatbelt, `sandboxWorkspaces` off, and a `--no-workspace` launch — and says that in each of them "the browser starts unconfined and no policy prevents the harness from reaching its private port". The harness user-documentation page groups the same three under "those two sandbox boundaries don't apply".

Two of those three are right. The third is not. Confinement for the browser child is decided from the browser's own scratch directory, not from the harness tab's workspace, so a `--no-workspace` browser tab on macOS with workspace isolation on runs under the full browser profile. What a `--no-workspace` launch actually loses is the harness-side port deny, and only that.

## Approach

Follow the value. `startE2EBrowserServer` in `src/browser/e2e-server.ts` calls `sandboxSpawn` with `workspaceDir: scratch.dir` — the directory it allocated for this browser — and `browser: {…}`. In `src/sandbox/index.ts`, `sandboxSpawn` computes `confinable` from that `dir` and then answers `options.browser` before the ordinary workspace test, handing both to `browserSpawn` in `src/sandbox/browser-spawn.ts`, which wraps the child in `sandbox-exec` whenever `workspaceDir` is set and the host can confine. For a browser spawn `workspaceDir` is always set, so the browser child is confined on any host that can confine anything, whatever the harness tab did.

The correction is therefore a split, not a deletion: the two host-level cases keep saying the browser is unconfined, and `--no-workspace` moves to its own sentence saying the browser is still confined and it is the harness-side deny that is missing, because there is no confined harness to apply it to.

`documentation/user-documentation/advanced-agents/workspacing.md` was checked for the same grouping and does not have it — its asymmetry paragraph already names only the two host-level cases. It is left alone.

## Design decisions

1. **The split is stated as two different losses, not as a shorter list.** Dropping `--no-workspace` from the paragraph would leave a reader thinking a workspace-less `-b` tab is fully covered, which is also false — it is the one configuration where a harness on a confining host can still reach every browser port, because the harness itself is not wrapped. Naming the loss precisely is the point of the fix.

2. **A test is added rather than the change being documentation-only.** The specification is the document the next change to this boundary is read against, and the sentence it will now carry — the browser is confined regardless of the harness's workspace — has nothing pinning it. Someone "fixing" the code to agree with the old wording would remove real kernel confinement and no test would move. The new case in `src/sandbox/index.test.ts` sits beside the existing browser spawn tests and asserts the wrapper directly.

3. **The test asserts on `sandbox-exec` and the browser profile, not on the absence of a harness workspace field.** There is no harness workspace to pass to `sandboxSpawn` — the browser spawn's `workspaceDir` *is* the browser's scratch directory, and the harness's workspace never reaches this function. What the test can show is that a browser spawn given only its own directory is wrapped, which is exactly the sentence the specification will carry.

4. **Nothing under `src/` changes except the test file.** The behaviour is already correct. This is a documentation fix with a regression test behind it.

5. **The port-deny sentence is written against the band, not against a per-launch parameter.** The harness-side deny was generalized two commits ago: it now covers a reserved band on every confined workspaced spawn. So what a `--no-workspace` harness loses is not "the deny for its own browser" but the band deny altogether, which is also why it can reach every other tab's browser and not merely its own.

## Implementation steps

1. **`src/sandbox/index.test.ts`.** Add a case beside the existing browser spawn tests: a browser spawn given its own scratch directory and no harness workspace at all is wrapped in `sandbox-exec` with `BROWSER_SANDBOX_PROFILE`, on any host that can confine. Guard it with `sandboxAvailable()` the way its neighbours do. Leave every existing browser spawn test untouched.

2. **`product/specs/sandbox.md`, the "Where confinement does not apply" paragraph.** Rewrite it so a host without Seatbelt and `sandboxWorkspaces` off remain the cases where the browser itself is unconfined and the guard is the only layer, and `--no-workspace` is stated separately: the browser is still confined to its own scratch directory, and what is missing is the harness-side port-band deny, because the harness that asked for the browser is not itself wrapped. Keep the closing sentences about the scratch directory still being created and the minimal environment still being given, and the note that this is the same host asymmetry a workspaced tab already has.

3. **`documentation/user-documentation/advanced-agents/harness.md`.** The containment paragraph groups all three cases under "those two sandbox boundaries don't apply". Split it the same way, in the page's plainer register: without macOS sandboxing or with workspace isolation off, the browser runs loose and only the guard applies; with `--no-workspace` on a machine that can sandbox, the browser is still boxed into its scratch directory but the harness is not blocked from reaching browser ports.

4. **`documentation/user-documentation/advanced-agents/workspacing.md`.** Checked, no change: its asymmetry paragraph names only the two host-level cases and never mentions `--no-workspace`.

## Tests

One new case in `src/sandbox/index.test.ts`: a browser spawn with no harness workspace is still wrapped in `sandbox-exec` under the browser profile on a confining host.

The existing browser spawn tests — profile selection with its own short parameter list, no credentials injected, and the unconfined-host fallback — must keep passing untouched. They are what says the rest of the browser spawn path is unchanged.

## Out of scope

- Any behaviour change. The code is right; only the documents are wrong.
- The rest of the End-to-end browser section, including the port-band paragraph, which is accurate.
- Widening or narrowing the actual confinement in either direction.
- `workspacing.md`, which does not carry the error (decision 4 in the steps above records that this was checked).

## Verification

`./scripts/run.mjs check-diff` — lint, typecheck, and the server suite, with the new case passing and the three existing browser spawn cases unchanged.

Read the rewritten paragraph against `browserSpawn` in `src/sandbox/browser-spawn.ts` and its one call site in `sandboxSpawn`: every case the paragraph now names should be traceable to `workspaceDir` being unset, `getConfig().sandboxWorkspaces` being false, or `sandboxAvailable()` being false — and for `--no-workspace`, to the harness's own spawn taking the pass-through return while the browser's does not.

By hand, on a macOS host with workspace isolation on: `harness claude --no-workspace -b`, then confirm the Chromium child is running under `sandbox-exec` (its parent command line shows the wrapper) while the harness tab's own shell is not.
