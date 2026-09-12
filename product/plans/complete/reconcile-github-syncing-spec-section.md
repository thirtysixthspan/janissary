# Reconcile the editor-tab spec's GitHub syncing section with the branch condition

**Complexity: 2/10** — prose only, inside one section of one spec file, with a companion read-through of a second spec to keep the two in the same words. No code, no tests, no behavior change; the behavior is already implemented. The number is not lower because the section states the same rule three times and the fix is to make all three agree, which needs each one read against the implementation rather than edited in isolation.

Work item, verbatim: *"Reconcile the GitHub-syncing spec section with the branch condition the same section now adds, and fix the 'confirmedly' typo in the new paragraph."*

`product/specs/editor-tab.md` → "GitHub syncing" gained a paragraph stating that syncing additionally requires the governing checkout to be on its default branch. But the paragraph above it still says syncing "is entirely config-driven" and that "a file syncs if and only if its path is covered by that setting", and the paragraph below it still says "Every config-listed file is edited from inside a single shared workspace" — so the section asserts both the old unconditional rule and the new conditional one within three paragraphs. The spec is the artifact the next change to syncing is read against, and a reader who stops at the "if and only if" sentence, the one written as the definitive statement of the rule, implements or reviews against a gate that no longer exists. The inserted paragraph also reads "confirmedly" where the rest of the change uses "confirmably".

## Design decisions

- **Two conditions, stated as two conditions.** The section keeps its existing shape — a paragraph for the path rule, a paragraph for the branch rule — but the path paragraph stops claiming to be the whole rule. It says the path condition is one of two and points at the branch condition, rather than rewriting both into a single paragraph.
- **"Config-driven" survives; "if and only if" does not.** The claim the section must keep is the *user-facing* one: there is no button or toggle, nothing to turn on or off per file. That is still exactly true — the branch condition is another automatic input, not a control. What must go is the logical claim that the path is a sufficient condition.
- **The path rule's own detail is untouched.** Exact paths, trailing-slash directories, and the `*` wildcard semantics are unchanged and stay word-for-word.
- **The workspace paragraph is scoped, not conditioned.** "Every config-listed file is edited from inside a single shared workspace" becomes a statement about files that actually sync, since a config-listed file on a feature branch is now edited in the project checkout. The rest of that paragraph — created once, reused, persists for the life of the application — is still correct and stays.
- **Vocabulary is pinned to the implementation's.** "confirmably" is the word used in `isPrimaryBranch`'s comment in `src/git/status.ts` and in `onPrimaryBranch`'s in `src/file-navigator/manager.ts`. The spec uses the same word.
- **No worked example of the off-primary tab.** The branch condition stays described in prose. Adding a walkthrough of what the absent sync icon looks like in practice is a documentation change, not a spec change, and the section already states that the absent icon is the entire signal.

## Proposed changes

- `product/specs/editor-tab.md` → "GitHub syncing":
  - Opening paragraph: replace the "syncs if and only if its path is covered by that setting" claim with one naming the path rule as the first of two conditions, keeping the no-toggle sentence and the entire description of entry forms.
  - Branch paragraph: "confirmedly" → "confirmably".
  - Workspace paragraph: scope its opening sentence to config-listed files that are actually syncing, leaving its remaining sentences untouched.
  - The provisioning, save-cycle, status-icon, and manual-resync paragraphs are left alone: a file that does not take the synced open path never reaches them.
- `product/specs/file-navigator-tab.md` → "Branch metadata": read against the result and left as it stands if it already describes the same rule in the same words; adjusted only where the vocabulary diverges.

## Tests

None. This is a spec-prose change with no behavior attached; the branch gate's behavior is already covered by the existing cases in `src/open/file-manager.test.ts` and `src/git/status.test.ts`.

## Out of scope

- Any code change. The behavior the section describes is already implemented and unchanged by this work.
- A worked example or screenshot of an off-primary editor tab.
- The user-facing documentation under `documentation/user-documentation/`, which does not describe the branch condition at all and so has nothing to reconcile.

## Verification

- `./scripts/run.mjs check-diff`
