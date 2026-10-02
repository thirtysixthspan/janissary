# Make each member's workspace name provably distinct

**Complexity: 2/10** — one helper gains a parameter, its two call sites pass it, and the derivation cases are updated. The collision itself cannot happen with the bundled catalog, so nothing observable changes today.

## Goal

`memberWorkspaceName` derives a member's workspace folder by replacing every `/` in the model with `-`, and that folding is not injective. A project overriding `.janissary/harness-models.json` can carry both `a/b` and `a-b`, which derive the same name — and `WorkspaceManager` keys its `refs` and `pending` maps by name, so the second `create` overwrites the first's entries.

The consequence is that two members are handed one clone directory, each is confined to it, and two agents write into the same working tree concurrently. Neither answer then describes a workspace of its own, cancelling one clone cancels the other's, and whichever clone settles first deletes the pending entry belonging to the second.

The bundled catalog is safe: all 59 ids contain a `/` and all 59 stay distinct after folding. That is exactly why this survived — the guarantee is a property of today's catalog rather than of the derivation, and a project override is the documented way to change it.

## Approach

Append the member's index to the derived name, making the derivation injective for any model list while keeping the folder readable.

## Implementation steps

1. In `src/multiagent/workspaces.ts`, give `memberWorkspaceName` the member's index and return `<label>-<model with / replaced by ->-<index>`.
2. Update the two call sites — `provisionMembers` and `releaseMembers` — to pass `member.index`. Both already hold the member, so the cancel a close issues stays paired with the create that started it.
3. Update the private `unusableName` helper the same way, since it builds the same name to validate it.

## Tests

In `src/multiagent/workspaces.test.ts`:

- Two models differing only in a `/` against a `-` derive different names. This is the case the finding is about and no existing test could have caught it.
- Two members of the same run with different indexes derive different names, which is the ordinary case the index exists for.
- Keep the existing derivation cases — a slashed model, an unslashed one, two labels — updating their expectations to include the index.
- The provisioning case that asserts the exact `create` names must be updated to the new form; its N-distinct-names assertion is the property being strengthened.

## Out of scope

- **Detecting a collision and refusing the second member.** Distinctness by construction makes the question moot, and a refusal would reject a legitimate comparison over a naming detail.
- **Changing the model catalog or its override handling.**

## Verification

```
./scripts/run.mjs check-diff
```

Then, with the app running: start a two-model `fanout` and confirm `.janissary/workspace/` gains two folders, one per member, each named `<tab>-<model>-<index>`, and that closing the tab removes both.
