# Split the pdf-text-layer.css formatting fixes out of the feature commit

**Complexity: 2/10** — no source logic, no tests, no behavior. The work is entirely about where a three-hunk formatting change sits in this branch's history. The number is not lower because the change is already inside a pushed commit, so the boundary has to be created without rewriting that commit, and because the finding's premise turned out to be partly wrong in a way the remedy has to account for.

Work item, verbatim: *"Split the unrelated CSS formatting fixes in `web/src/plugins/pdf/pdf-text-layer.css` out of this feature PR into a separate commit or pull request."*

`web/src/plugins/pdf/pdf-text-layer.css` gains three empty-line-before changes inside `d087b88f feat(git): disable GitHub syncing off the primary branch`. The file has no logical connection to the git-sync gate, so a reviewer scanning the diff list spends cycles determining whether the formatting interacts with the feature.

## What the code says that the finding did not

The finding calls the changes gratuitous. They are not optional: master's version of this file **fails** the stylelint gate today —

```
28:3  ✖  Expected empty line before custom property  custom-property-empty-line-before
54:3  ✖  Expected empty line before custom property  custom-property-empty-line-before
57:3  ✖  Expected empty line before declaration      declaration-empty-line-before
```

— a breakage that arrived with the bundled PDF viewer plugin and that any branch running `npm run check` must fix to go green. So the change is a *prerequisite* of this branch passing its gate, not a stray edit that wandered in. That does not make it part of the feature, and the finding's remedy still applies; it does change which remedy is correct.

## Design decisions

- **The commit boundary, not the removal.** Reverting the formatting to master's state would take the file out of this PR's diff and satisfy the finding's letter, but it would leave the branch failing `npm run check` on a gate that is currently the only thing standing between this PR and a red build. A reviewer's convenience does not outrank the branch being green.
- **A separate pull request is not available here.** The finding's first option — extract into a standalone PR merged before this one — is the option that would also fix master directly, and it is the better fix. It is outside what this task may do: PR update mode may commit and push to this PR's head branch and nothing else. This is reported rather than worked around.
- **The boundary is made without rewriting the pushed commit.** `d087b88f` is already on the remote and must not be amended, squashed, or rebased. The boundary is therefore created forward: one commit takes the formatting back out of the branch's tree, and the next reinstates it under a message naming the stylelint gate as its motivation. The net tree is identical to what is there now, `npm run check` stays green, and `git log -- web/src/plugins/pdf/pdf-text-layer.css` and `git blame` both land a reader on a commit that explains the change instead of on a git-sync feature commit.
- **The CSS itself is not touched.** All three hunks are correct as written, and the file's content after this work is byte-for-byte what it is now.

## Proposed changes

- `web/src/plugins/pdf/pdf-text-layer.css`, in two commits with no net change to the file:
  1. A `revert` commit removing the three blank lines, stating that it exists to lift the formatting out of the feature commit's scope and that the following commit restores it.
  2. A `style(pdf)` commit restoring them, naming `custom-property-empty-line-before` and `declaration-empty-line-before` and recording that master fails both today.

## Tests

None — CSS formatting with no rendered difference. `npm run check`'s stylelint step is the gate this is about, and it is green before and after because the file's final content is unchanged.

## Out of scope

- Fixing master's stylelint failure at its source, which needs a pull request against master that this task may not open.
- Any change to the CSS rules themselves, or to the PDF plugin.
- Rewriting, amending, or reordering the commits already pushed to this branch.

## Verification

- `./scripts/run.mjs check-diff`
- `npx stylelint "web/src/plugins/pdf/pdf-text-layer.css"` clean at the end.
