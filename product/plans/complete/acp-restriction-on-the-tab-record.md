# Keep the ACP tool restriction on the tab it belongs to

**Complexity: 5/10** — one runtime field instead of one manager-owned set, two overrides gone, and tests that prove the policy survives a connection reset.

The tool-less session added a `Set<string>` to `AcpManager`, keyed by label, plus `closeTab` and `closeAll` overrides whose only job was keeping that set tidy. Both are state the repository's per-agent ownership rule puts on the tab: `TabRuntime` already holds `lastActivity`, `gateNeedsUser`, and `acpPrompt`, all of them per-tab facts a reader reaches through the tab's own record. A label-keyed collection in a manager has to be synchronised by hand on every path that ends a tab's life, and the next teardown the repository grows has to remember it.

## Goal

The tool restriction lives on the tab's runtime, and the manager keeps no bookkeeping of its own.

## Approach

1. **`src/tab/types.ts`** gains a narrowly named boolean on `TabRuntime`. It is a policy for the tab's own ACP session rather than a screen or content fact, and the comment says so, including that it is sticky: a session that dies is replaced by one held to the same rule, and only the tab's own release forgets it.
2. **`src/acp/manager.ts`** records the field through the owning tab when `start` is handed `{ withoutTools: true }` and reads it the same way in `run`, before the tool table is built. The `Set`, the `closeTab` override, and the `closeAll` override all go; `AcpSessionManager` keeps owning connection teardown, which is the only thing it ever owned.
3. **`product/plans/complete/acp-tool-less-plugin-sessions.md`** is aligned with tab-owned storage. The published capability contract is unchanged: `startAcp({ withoutTools: true })` still asks, the host still records, and the enforcement point is still in `run`.

### Rejected alternatives

- Keeping the set and adding the field beside it. Two records of one policy, and the reader has to know which to trust.
- Recording it on the session rather than the tab. A session is replaced when the old one dies, and the policy has to survive that — which is the whole reason it is per-tab.
- Leaving the cleanup overrides in place "just in case". Their only purpose was the set; with the set gone they are two overrides that do nothing, and a future reader has to work out what they guard.

## Implementation steps

1. Add the field to `TabRuntime`.
2. Record and read it in `src/acp/manager.ts`, and drop the set and the overrides.
3. Extend `manager.test.ts` with real tab records for persistence and replacement.
4. Align the completed plan.
5. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/acp/manager.test.ts`: a real tab record started with `withoutTools` keeps the restriction across a closed-and-replaced session, and a tab that was never started that way gets the ordinary tool table.
- `src/acp/plugin-session.test.ts`: the real-loop contrast cases are retained unchanged — a restricted reply cannot execute a tool, an ordinary one can — and the session-identity case still reports a replacement.
- A tab record that is recreated under a reused label starts on the ordinary policy.

## Spec updates

- None. The published contract and the described behaviour are unchanged.

## Out of scope

- The additive capability itself, which stays exactly as it is.
- Where the launcher asks for the tool-less session, which stays in `summarizer.ts`.
