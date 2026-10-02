# Correct the clone-naming step in the pull request description

**Complexity: 1/10** — one sentence of prose in one section of the pull request's description, plus this plan and the backlog removal. No code changes.

## Goal

Step 2 of the pull request's **How to verify** describes where a member's clone lands, and it no longer matches where it lands.

The step reads: "Confirm `.janissary/workspace/` gains one clone per member, each named after the tab and the model with its `/` replaced by `-`."

`memberWorkspaceName` in `src/multiagent/workspaces.ts` derives `<label>-<model with / replaced by ->-<member index>`. The index is what makes the name provably distinct — folding `/` to `-` is not injective, so a project overriding `.janissary/harness-models.json` can carry both `a/b` and `a-b`, and without the index two members would be handed one clone to write into concurrently. That change landed on this branch after the description was written.

Observed at `b62e24cf`: a two-member run produced exactly `multi-agent-opencode-big-pickle-0` and `multi-agent-google-gemini-3.1-flash-lite-1`.

## Approach

Rewrite that one step to name the index, with the observed names as the example. Nothing else in the description moves.

The same wording appears in the **Verification** section of `product/plans/complete/multiagent.md`. A completed plan is a historical record of what was decided at the time, so it is left alone — which is why the description is the only place the correction belongs.

## Implementation steps

1. Read the current description body.
2. Replace step 2 of **How to verify** with wording that gives the full derived form and an example, keeping the rest of the step's sentence intact.
3. Write the whole revised body to a file and apply it with `gh pr edit --body-file`. Never pass `--title`.

## What must not change

Every other character of the description: the **What**, **Behavior examples**, the other fourteen verification steps, **Files changed**, **Notes on scope**, and the **Additional test cases** section a later test run appended. The title is not touched at all.

## Tests

None. This is prose, and no test asserts it — the naming it describes is already pinned by the cases in `src/multiagent/workspaces.test.ts`, including the one asserting that a slashed model and an unslashed one derive different names.

## Out of scope

- **The plan's own Verification wording**, left as the historical record it is.
- **Any code change.** The behavior the step describes is correct and is what the fix intends.

## Verification

Read the description back after the edit and confirm step 2 names the member index, that the other fifteen verification steps and every other section are byte-for-byte what they were, and that the title is unchanged.
