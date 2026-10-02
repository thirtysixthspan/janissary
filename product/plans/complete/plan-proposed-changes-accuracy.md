# Correct the feature plan's proposed-changes section

**Complexity: 2/10** — prose in one file, checked against code that unit tests already pin. No code changes at all.

## Goal

`product/plans/complete/multiagent.md` now gives two different answers to the same question in one file.

The consolidation that folded the repair plans in updated the **Design decisions** section and left the **Proposed changes** section describing the code as it stood before those repairs. Five statements are wrong:

- `src/multiagent/types.ts` — `MultiAgentRun` is said to hold `cloning`, "the number of clones in flight". The field was removed; the count is derived at projection time.
- `src/multiagent/workspaces.ts` — `memberWorkspaceName` is said to derive `<tab label>-<model with / replaced by ->`. It appends the member's index, and that is the whole point of the name.
- `src/multiagent/sessions.ts` — described as creating each session with the own-tools opt-in. It now refuses a member outright when its spawn would not be confined, which is what decides the opt-in.
- `src/acp/tools.ts` — refers the reader to `multiagent-own-tools-requires-confinement`, a plan file this consolidation deleted.
- `src/tab/view.ts` — "carrying the prompt, the members and the count", where the count is now counted in that same branch rather than carried.

The plan is the historical record a later reader consults before touching this feature. Two answers in one file is worse than either answer alone.

## Approach

Correct the five statements so each describes what the code does, and change nothing else. The complexity rating, the section structure, the decisions, the tests list, the out-of-scope list and the declined-gaps list are all accurate as they stand.

## Implementation steps

1. `src/multiagent/types.ts` entry — drop `cloning`, and say the count is derived at projection time from the member states.
2. `src/multiagent/workspaces.ts` entry — add the index to the derived name, and say it is what makes the names distinct by construction.
3. `src/multiagent/sessions.ts` entry — say a member is refused before any session is created when its spawn would not be confined, read through `sandboxNotice`, and that the directory is bound once for both `cwd` and `workspaceDir`.
4. `src/acp/tools.ts` entry — replace the reference to the deleted plan with the confinement condition itself.
5. `src/tab/view.ts` entry — say the count is counted from the members being projected rather than carried.
6. Check the reuse table's row naming `runDelegated` in `src/commands/delegated.ts`. The command appends its own transcript entries and does not delegate through it, so either use it in `src/commands/fanout.ts` or drop the row — a table of things to reuse should not list something the reuse never happened.

## Tests

None. This is prose describing behavior that `src/multiagent/workspaces.test.ts` and `src/tab/view.test.ts` already pin: the naming cases assert the indexed form and the collision case, and the projection cases assert that no clone directory reaches the wire and that the count reflects current member states. If the prose and the code ever disagree again, one of those tests is what notices.

## Out of scope

- **The plan's decisions, tests, out-of-scope and declined-gaps sections**, which are accurate.
- **Any code change.** Where the prose and the code differ, the code is right.

## Verification

Read the corrected section against `src/multiagent/types.ts`, `src/multiagent/workspaces.ts`, `src/multiagent/sessions.ts` and `src/tab/view.ts`, and confirm each of the five statements now matches, and that no reference to a deleted plan file survives anywhere in the document.
