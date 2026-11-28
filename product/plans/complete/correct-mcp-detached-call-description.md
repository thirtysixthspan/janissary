# docs(mcp): correct the PR description's claim that a detached call is rejected at once

**Complexity: 1/10** — no production lines or files, 7 requirements, no test scenarios (p=3.04)

## Goal

PR #2256's What section says "a call made while detached is rejected before any frame is sent with `Janissary is not connected.`". That's not what the far-side endpoint does. A call made while the link is down is held like one already in flight, and the immediate refusal only starts once a grace window has expired with no link. A reviewer who trusts the sentence will expect an instant failure after Detach and see a 60-second hold instead. This plan rewrites that one sentence to match the code and the spec, and points its anchors at the lines that hold the behavior today.

## Requirements

1. The sentence says that "a call made while the link is down waits like one in flight", per the backlog proposal.
2. The sentence says that new calls fail at once with `Janissary is not connected.` "only once a grace window has expired with no link".
3. The sentence says the immediate refusal lasts "until a link returns".
4. The sentence's code anchor names `FarSideMcp.relay` in `src/remote/serve-mcp.ts` at its current lines.
5. The sentence cites the test "holds in-flight and new calls through a link loss and re-sends them when it returns".
6. The sentence cites the test "fails a call made while detached at once with the detach error".
7. The correction leaves the change-set statistics out, with no commit, file, or line counts and no SHAs.

## Design decisions

- Only the one sentence in the What section's remote-protocol paragraph changes. The proposal names that sentence, and the playbook forbids touching unrelated description text.
- The other anchors in the same paragraph, the How to verify step 9 wording, and the wrong-anchors list belong to separate backlog entries and stay as written here.
- The anchors `src/remote/serve-detach.ts:76` and `src/remote/serve.ts:227-231` stay, because they still point at the `linked()` checks the relay consults (Assumption 4).
- The existing test anchor "fails a held call when the link drops a second time after an in-window re-send" stays beside the two new ones, since it still pins the in-flight half of the sentence.
- The wording follows `product/specs/mcp-server.md`, which already describes the two-phase refusal correctly (Assumption 3), so the spec needs no change.
- The body edit happens after the push, through `gh pr edit --body-file ./temp/pr-body.md`, with the body re-read just before the edit.

## Preserved behavior

None found

## Assumptions

1. `relay` refuses at once only when the endpoint is already marked detached and the link is down: `src/remote/serve-mcp.ts:164` "`if (this.detached && !this.linked()) { reject(new Error(NOT_CONNECTED)); return; }`".
2. The detached mark is set only when the grace window runs out: `src/remote/serve-mcp.ts:134-136` "`if (++this.ticks >= GRACE_TICKS) {`" followed by "`this.detached = true;`".
3. The spec already states the held-then-refused behavior: `product/specs/mcp-server.md:61` "A call made while the link is down waits like one already in flight." and "A call made after that fails at once with the same text until a link returns."
4. The far side's link checks are still at the cited lines: `src/remote/serve-detach.ts:76` "`linked(): boolean { return !this.stopped && this.sink !== undefined; }`" and `src/remote/serve.ts:227` "`linked(): boolean {`".
5. The grace window is 60 ticks of one second: `src/remote/serve-mcp.ts:15-16` "`GRACE_TICK_MS = 1000`" and "`GRACE_TICKS = 60`".

## Existing functionality

1. The relay that holds or refuses a call: `src/remote/serve-mcp.ts:162` "`private relay: ToolExecutor`".
2. The grace window tick and start: `src/remote/serve-mcp.ts:132` "`private graceTick(): void`" and `src/remote/serve-mcp.ts:141` "`private startGrace(): void`".
3. The test pinning held new calls: `src/remote/serve-mcp.test.ts:322` "`holds in-flight and new calls through a link loss and re-sends them when it returns`".
4. The test pinning the post-expiry refusal: `src/remote/serve-mcp.test.ts:370` "`fails a call made while detached at once with the detach error`".

## Implementation steps

1. Promote this plan to `product/plans/complete/` and remove the matching entry from `product/backlog/pull-request.md`, leaving the other entries byte-for-byte. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit with `$janissary/scripts/run.mjs pr-commit` and push to `feat/janissary-mcp-server`.
3. Re-read the PR body with `gh pr view --json body`. Replace the sentence that begins "Calls hold through a link loss for a 60-second grace window" with the corrected sentence and anchors `[src/remote/serve-mcp.ts:132-144] [src/remote/serve-mcp.ts:162-187] [src/remote/serve-detach.ts:76] [src/remote/serve.ts:227-231]` plus the three test anchors. Write the full body to `./temp/pr-body.md` and apply it with `gh pr edit --body-file`.

## UI design

None. The change touches only the pull request description.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The two tests named in Requirements 5 and 6 already pin the behavior the corrected sentence describes.

## Out of scope

- Any code change in `src/remote/serve-mcp.ts`.
- The other anchors in the What section, the Remote question flow anchors, and How to verify steps 9, 12, and 13.
- The PR title.
- `product/specs/mcp-server.md`, which already matches.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read the PR body with `gh pr view 2256 --json body`. The What section's remote-protocol paragraph should say a call made while the link is down waits like one in flight, and that new calls fail at once with `Janissary is not connected.` only after a grace window expires with no link. It should anchor `src/remote/serve-mcp.ts:162-187`, and at line 164 of that file you should find the `this.detached && !this.linked()` refusal. A diff of the old and new body should show only that sentence and its anchors changed. Any other line differing, or the phrase "rejected before any frame is sent" surviving, means the correction was wrong.
