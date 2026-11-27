# Document remote MCP cancellation and grace-expiry withdrawal in the PR description

**Complexity: 1/10** — 7 description-content requirements, no production lines or files edited and no test scenarios (p=3.04); the change is a single anchored sentence plus one frame name in an existing pull request paragraph.

## Goal

PR #2256's description paragraph beginning "Remote protocol version 49 adds" names only `mcp-call` and `mcp-result`, and describes a call that outlives the grace window only as a tool error. The branch already ships an `mcp-cancel` frame that withdraws the local question on caller abort and on grace expiry. A reviewer relying on the description can therefore miss that an abandoned or timed-out remote call closes the panel, records a withdrawal line and promotes the next queued question. Name the frame and describe that behavior in the paragraph, anchored to the code and the test that pin it.

## Requirements

1. The remote paragraph's frame list includes `mcp-cancel` alongside `mcp-call` and `mcp-result` — Proposal: "add `mcp-cancel` to the frame list".
2. The paragraph states that a caller abort sends `mcp-cancel` so the local question is withdrawn, its panel closed, `Question from <tab> withdrawn` recorded and the next queued question promoted — Proposal: "a caller abort ... sends that frame so the local question is withdrawn, its panel closed, `Question from <tab> withdrawn` recorded and the next queued question promoted".
3. The paragraph states that a grace-window expiry sends the same frame with the same withdrawal effects — Proposal: "a grace-window expiry sends that frame".
4. The paragraph states that a call already answered is unaffected — Proposal: "while a call already answered is unaffected".
5. The new sentence cites the abort and `fail()` paths in `src/remote/serve-mcp.ts` — Proposal: "anchor it to the abort and fail() paths in src/remote/serve-mcp.ts".
6. The new sentence cites the test "withdraws an unanswered question on cancel and shows the next queued one" in `src/remote/mcp-relay.test.ts` — Proposal: the same named test.
7. Only that paragraph changes: every other paragraph stays byte-for-byte, change-set statistics are left out, and the title, code, specs, help and protocol version are untouched — Proposal: "Do not edit code or bump the protocol version"; task: "preserving every other paragraph byte-for-byte, and leave change-set statistics out".

## Design decisions

- One paragraph, two edits: extend the existing frame list and append one sentence. The paragraph already owns the remote frame story, so no new section is added.
- The sentence describes caller-visible effects (withdrawal, panel close, notification line, next question) and cites the abort and `fail()` paths plus the named test, so a reader can check the claim against the code without the prose restating implementation details.
- The description edit is applied in Step 8, after the commit is pushed, not during implementation. A description is live on GitHub while a file edit is not until pushed; editing earlier could leave the PR describing work that is not on its branch if a later step failed.
- The full body is round-tripped through `gh pr view --json body` and `gh pr edit --body-file`, because `gh pr edit` replaces the body wholesale and preservation of the author's other paragraphs is the caller's responsibility.
- No code, protocol-version, spec, help or documentation-tree change is made: the protocol changelog and `product/specs/mcp-server.md` already record this behavior, so the remedy is description fidelity alone.
- The plan file and the backlog-entry removal still produce a commit, so Step 8's "nothing to ship" guard does not fire for a description-only fix.

## Preserved behavior

None found. The change edits no application code; no existing behavior needs an explicit preservation action or a new test. Byte-for-byte preservation of the other description paragraphs is recorded as Requirements and checked in Verification.

## Assumptions

1. `src/remote/serve-mcp.ts:184-188` "`const onAbort = () => { this.send({ type: 'mcp-cancel', call }); ... }`" — a caller abort sends the frame.
2. `src/remote/serve-mcp.ts:123-130` "`private fail(call: string, message: string): void { ... this.send({ type: 'mcp-cancel', call })`" — the failure path sends the same frame.
3. `src/remote/serve-mcp.ts:146-152` "`if (++this.ticks >= GRACE_TICKS) { this.stopGrace(); this.detached = true; for (const call of this.pending.keys()) this.fail(call, NOT_CONNECTED); }`" — grace expiry routes through `fail()`.
4. `src/remote/mcp-relay.test.ts:170-189` "withdraws an unanswered question on cancel and shows the next queued one" — the test pins withdrawal, the `Question from asker withdrawn` notification and promotion of the next queued question.
5. `src/remote/mcp-relay.test.ts:191-208` "ignores a cancel after the answer and still replays the stored result" — an answered call is unaffected by a late cancel.
6. `src/remote/protocol.ts:276-278` "It also adds `mcp-cancel`, keyed by the same call id" — the changelog already records the frame in version 49, so no version bump is needed.
7. `product/specs/mcp-server.md:26` "A remote harness's cancellation reaches the local side over the session, including one issued because the link stayed down past the grace window" — the spec already records the behavior, so no spec edit is needed.

## Existing functionality

1. Reading the live pull request body: `ai/tasks/feature/work-pull-request-issue.md:148` "`gh pr view <reference> --json body`".
2. Applying a multi-line body without shell quoting problems: `ai/tasks/feature/work-pull-request-issue.md:148-152` "`gh pr edit <reference> --body-file ./temp/pr-body.md`".
3. A scratch body file that cannot reach a commit: `ai/tasks/feature/work-pull-request-issue.md:154` "`temp/` is gitignored, so the scratch file cannot reach a commit".
4. The existing remote paragraph, which already carries `src/remote/...` and `[test: ...]` anchors in the same style the new sentence uses.

## Implementation steps

1. Read the current body of https://github.com/thirtysixthspan/janissary/pull/2256 with `gh pr view <url> --json body` and write it in full to `./temp/pr-body.md`, preserving every byte outside the target paragraph. Build: `$janissary/scripts/run.mjs check-diff`.
2. In `./temp/pr-body.md`, edit only the paragraph beginning "Remote protocol version 49 adds": add `mcp-cancel` to the frame list, and append one sentence stating that a caller abort or a grace-window expiry sends the frame so the local question is withdrawn, its panel closed, `Question from <tab> withdrawn` recorded and the next queued question promoted, while an already-answered call is unaffected; anchor it to the abort and `fail()` paths in `src/remote/serve-mcp.ts` and to the test "withdraws an unanswered question on cancel and shows the next queued one" in `src/remote/mcp-relay.test.ts`, following the paragraph's existing `[path:line]` and `[test: file "name"]` anchor style. Build: `$janissary/scripts/run.mjs check-diff`.
3. Confirm no other paragraph changed and no change-set statistics were introduced. Do not apply the edit yet — it is applied in Step 8 sub-step 5 of `work-pull-request-issue.md`, after the commit is pushed, with `gh pr edit <url> --body-file ./temp/pr-body.md`. Build: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change edits a pull request description; no application surface changes.

## Tests

This plan changes no application behavior and introduces no code, so no tests are added. The behavior the new sentence describes is already pinned by `src/remote/mcp-relay.test.ts` "withdraws an unanswered question on cancel and shows the next queued one" and "ignores a cancel after the answer and still replays the stored result"; those tests are cited, not modified.

## Out of scope

- Editing source, tests, CSS, specs, help pages or either documentation tree.
- Bumping `REMOTE_PROTOCOL_VERSION` or touching `src/remote/protocol.ts`.
- Changing any description paragraph other than the one beginning "Remote protocol version 49 adds", or changing the PR title.
- Stating change-set statistics, commit counts or SHAs in the corrected paragraph.
- Merging or closing the pull request, rewriting published history, or force-pushing.

## Verification

Run `$janissary/scripts/run.mjs check-diff` — no lint, typecheck or test regression is expected; a description-only change may report no checks apply.

Then read the pull request body with `gh pr view <url> --json body` and confirm the paragraph beginning "Remote protocol version 49 adds" lists `mcp-call`, `mcp-result` and `mcp-cancel`, and contains exactly one new sentence covering caller abort and grace-window expiry withdrawal with the four effects and a citation of the `serve-mcp.ts` abort/`fail()` paths and the named `mcp-relay.test.ts` test. Confirm every other paragraph is byte-for-byte what it was before, that no commit/file/line counts were added, and that `git diff` against the pre-change commit shows only the plan file and the removed backlog entry — no code, spec, help or protocol-version change.
