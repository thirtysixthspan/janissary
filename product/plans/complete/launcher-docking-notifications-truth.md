# Say where docking Notifications actually puts it

**Complexity: 3/10** — three sentences that contradict the docking rule they sit next to, and one of them is on the pull request itself.

The pull request's own description says, in its example and again in its verification step, that a rail row configured `notifications left` opens the feed "docked in the LEFT sidebar, displacing the launcher rather than stacking on it". Both halves are wrong, and the code that decides it is short: `applyDock` in `src/tab/dock.ts` finds an occupant only when `sameDockKind` holds, and `sameDockKind` returns false as soon as the two tabs' `view` differs. The launcher is a plugin tab and the feed is a `notifications` view tab, so they are different kinds — the feed is left docked where the launcher already is, and the two share the sidebar through the client's tab-switcher. `product/specs/sidebars.md` calls that "Sharing a sidebar".

The two committed documents carry the same wrong claim, plus a direction error the pull request does not have:

- `product/specs/launcher.md` says "so `notifications left` docks the notifications feed to the right". `src/commands/notifications.ts` reads its `left`/`right` keyword and docks into exactly the sidebar it names.
- `product/plans/complete/sidebar-launcher-tab.md` says "`notifications left` still docks right".

A reviewer reading the description, or a future test written from it, would assert a displacement that does not happen and a direction that is the other one.

## Goal

The example, the verification step, and both committed documents say what `notifications left` does: it joins the left sidebar alongside the launcher, and the feed is selected there through the normal sidebar mechanism.

## Approach

1. **The pull request description** is corrected after the push, never before — a description is a live artifact and a file edit is not until it is pushed, so editing it earlier would leave the pull request describing work that is not on its branch if a later step failed. Only the two paragraphs the entry names are touched; the rest of the body is byte-for-byte what it is.
2. **`product/specs/launcher.md`** and **`product/plans/complete/sidebar-launcher-tab.md`** say the same thing, and drop the direction error. The docking rule itself is not touched: `sidebars.md` and `notifications.md` describe the different-kind occupant rule correctly already, and `product/specs/launcher.md`'s own opening paragraph is right.

### Rejected alternatives

- Changing `applyDock` to displace a different-kind occupant. It would break the file navigator and the notifications tab sharing a sidebar, which `sidebars.md` deliberately documents and the client's tab-switcher implements.
- Editing the description before publishing. See above: the ordering is the whole reason the step exists.

## Implementation steps

1. Correct the two committed documents.
2. Commit and push.
3. Read the live description, apply the two corrections, and write the full revised body through `gh pr edit --body-file`.

## Tests

- None. This changes no behaviour; `src/tab/dock.test.ts` and `src/tab/operations.test.ts` already cover the different-kind occupant rule, and they are the behaviour reference rather than something to extend.

## Spec updates

- `product/specs/launcher.md`: the rail example says what `notifications left` does.
- `product/plans/complete/sidebar-launcher-tab.md`: the design decision drops the direction error and states the sharing rule.

## Out of scope

- The notifications tab's own spec, which already describes the different-kind occupant rule correctly.
- `sidebars.md`, which is also already correct.
