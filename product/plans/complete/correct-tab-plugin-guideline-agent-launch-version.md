# Correct the tab plugin guideline's agent launch API version

**Complexity: 1/10** — one version-history paragraph in a single guideline file; no code, behavior, test, spec, or documentation changes.

The API-version paragraph in `ai/guidelines/plugins-tabs.md` says API v3 removes the agent launch contract. That misattributes a v2 removal. `product/specs/tab-plugins.md`'s API v2 section records that v2 removed agent launch actions and conversation launch-agent intents and retained `launchShellHere()` as a deprecated compatibility path until v3. Its API v3 section limits that release's removals to `useAcpResponse`, `TabView.acpResponse`, `launchShellHere()`, and the response panel with its Reset ACP control. `documentation/developer-documentation/tab-plugins.md`'s v2 changelog and v3 entry agree.

## Goal

The guideline's version paragraph attributes the agent launch contract removal to API v2, notes that `launchShellHere()` remained as a deprecated compatibility path until v3, and limits the v3 removal list to `useAcpResponse`, `TabView.acpResponse`, `launchShellHere()`, and the panel/Reset controls. The historical v1 `useAcpResponse` introduction note and the frozen-fixture/refusal sentence stay unchanged.

## Approach

Edit only the API-version paragraph of `ai/guidelines/plugins-tabs.md`. The spec and developer reference are already correct and serve as verification sources, not edit targets. No source or test changes are needed; the existing `src/plugins/documentation.test.ts` assertions must keep passing unchanged.

## Implementation steps

1. Rewrite the paragraph so API v2 owns the agent launch removal, `launchShellHere()` is described as retained for deprecation until v3, and API v3 owns only the client `useAcpResponse` hook, the `TabView.acpResponse` projection, the client `launchShellHere()` shim, and the response panel with its Reset ACP control.
2. Keep the historical v1 `useAcpResponse` sentence, the frozen `fixture-v1`/`fixture-v2` statement, and the v1/v2 refusal and v3 round-trip statement unchanged.
3. Reread the revised paragraph against `product/specs/tab-plugins.md`'s API v2 and v3 sections and `documentation/developer-documentation/tab-plugins.md`'s v2 and v3 changelog entries.

## Tests

None — this is a prose correction to a guideline, not a behavior change. Verification is reading the revised paragraph against both authoritative sources and running `$janissary/scripts/run.mjs check-diff`. The migrated `src/plugins/documentation.test.ts` topic/count assertions must pass unchanged.

## Out of scope

- `product/specs/tab-plugins.md` and `documentation/developer-documentation/tab-plugins.md` — both already record the correct v2 and v3 history.
- Any source or test file, including `src/plugins/documentation.test.ts` — its assertions already pass against the intended wording.
- Other paragraphs of `ai/guidelines/plugins-tabs.md`, including the separate v3 `launchShellHere()` guidance in the client contract.
- The pull request description, which needs no correction for this entry.

## Verification

- `npm run test:server -- src/plugins/documentation.test.ts` — the documentation assertions pass unchanged.
- `$janissary/scripts/run.mjs check-diff` — no production or test changes are expected.
