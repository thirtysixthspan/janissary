# Conversations plugin — a durable per-conversation workspace

**Complexity: 3/10** — the deliverable is a further revision of an unimplemented draft plan (`product/plans/draft/conversations-plugin.md`). No source, test, or spec file changes: nothing in that plan has been built, so there is no shipped behavior to alter and no functional spec to correct. The work is analytical — deciding the on-disk layout, working out which existing helper the new lifetime can and cannot reuse, and checking the sandbox actually permits a workspace at the new location.

## Goal

The plan currently gives every conversation the *same* empty workspace: one directory under the project's `.janissary/workspace/`, provisioned lazily on the first query any conversation sends, refcounted through `WorkspaceManager`, and deleted at shutdown. Change it so each conversation has its **own** workspace, stored beside that conversation's own data under `~/.janissary/`, created and destroyed with it — the conversation and its workspace survive together, across runs, and go away together when the conversation is deleted.

The revised plan must stay a plan — it is not implemented here — and must be internally consistent afterwards: nothing left describing a shared workspace, a project-level workspace path, `provisionEmptyWorkspace`, `WorkspaceManager.createEmpty`, or the reserved-name collision rule those implied.

## Approach

The substitution is smaller than the previous one but changes two things beyond the workspace itself.

**The on-disk shape becomes a directory per conversation.** The plan currently stores `~/.janissary/conversations/<id>.json`. Give each conversation a directory instead — `~/.janissary/conversations/<id>/` holding `conversation.json` and `workspace/`, with the sandbox's own `workspace.tmp/` landing beside them because `sandboxSpawn` derives `TMPDIR` as `${workspaceDir}.tmp` (`src/sandbox/index.ts:231`). "Survive together" then stops being a rule anyone has to remember and becomes the layout: one `mkdir` creates both, one recursive remove destroys both, and there is no way to delete one and leak the other.

**`WorkspaceManager` drops out entirely.** Its whole contract is the opposite of what a durable workspace needs — refcount a clone, delete it when the last tab that wanted it closes, and sweep everything at shutdown (`src/workspace/manager.ts:62`, `:83`). A conversation's workspace must outlive the process. So the plan stops adding `provisionEmptyWorkspace`/`createEmpty` to `src/workspace/` and has the conversations store own its directories outright, reusing only the two location-independent helpers that still apply: `trustWorkspace(dir, claudeJson)` (`src/workspace/index.ts:72`), so the Claude ACP adapter will run there, and `untrustWorkspace(dir)` (`:182`) on delete, so `~/.claude.json` does not accumulate an entry per conversation forever. `untrustWorkspace` hardcodes `~/.claude.json` where `trustWorkspace` takes it as an injectable parameter; the plan should give it the same optional parameter, both for symmetry and so the delete path is testable against a temp file.

**The sandbox permits the new location, and gains a property at it.** Worth stating in the plan rather than leaving an implementer to discover: the workspace and its temp sibling are carved in for reads *and* writes by absolute path (`(subpath (param "WORKSPACE"))` in both the `file-write*` and `file-read-data` blocks of `src/sandbox/profile.ts`), so a workspace under `$HOME` is fine — the project-level one already is, in the common case. What the per-conversation layout adds is isolation the shared one did not have: only `<id>/workspace` is carved in, so the rest of `~/.janissary` stays under the blanket `$HOME`-contents deny. One conversation's agent cannot read another conversation's workspace, nor any conversation's stored turns — not even its own `conversation.json`, which sits one directory above its carve-in.

**Creation stays lazy.** The directory is created on the conversation's first query, not when the row is created, so the `ai/guidelines/plugins.md` §6 argument the plan already makes — a user who opens the list and never asks anything pays nothing — keeps holding, and an abandoned `New conversation` leaves neither a directory nor a trust entry behind.

## Implementation steps

1. **Replace the shared-workspace design decision** in `product/plans/draft/conversations-plugin.md` (currently the paragraph beginning "The workspace is **shared by every conversation**") with the per-conversation one: the layout, the lazy creation on first query, the idempotent ensure-and-trust on every connect, the isolation property, and the costs now accepted deliberately (a trust entry and a directory pair per conversation). Adjust the preceding sandbox paragraph where it says the workspace "stays empty" — it is empty at creation and durable thereafter.
2. **Rewrite the storage decision** ("One JSON file per conversation, rewritten atomically") as a directory per conversation, keeping the atomic rewrite of `conversation.json` through `src/atomic-write.ts` and adding what deletion now removes.
3. **Update the reuse table**: drop the `WorkspaceManager` refcounting row and narrow the `src/workspace/index.ts` row to `trustWorkspace`/`untrustWorkspace`.
4. **Rewrite the Proposed changes**: delete the "Empty workspace" paragraph that added `provisionEmptyWorkspace` and `createEmpty`, fold directory ownership into the Conversation-store paragraph, and correct the manager and sessions paragraphs where they provision or release a shared workspace.
5. **Update Ordering** — the extraction checkpoint loses its workspace half, leaving `src/acp/launch.ts` alone.
6. **Rewrite the affected tests**: drop the `src/workspace/` cases, add store cases for directory creation, trust, reuse across runs, and delete-removes-everything, and correct the manager cases that referenced the shared workspace.
7. **Update Out of scope and Open questions**: "a per-conversation workspace" stops being deferred and its inverse becomes a rejected alternative; the open question about sweeping the shared workspace at shutdown is answered by the new lifetime and retires; add the one the change raises — whether the delete confirmation must say the workspace goes too.
8. **Update Specs and Verification** to match the new layout and lifetime.

Run `./scripts/run.mjs check-diff` after the rewrite.

## Tests

None. The change edits one markdown plan file under `product/plans/`; there is no code path to cover, and the repository has no tests over plan documents. `./scripts/run.mjs check-diff` is still run, and reports no lintable, typecheckable, or testable change.

## Out of scope

- **Implementing the conversations plugin.** The plan stays in `product/plans/draft/`.
- **Changing any source file.** The `untrustWorkspace` parameter, the store's directory ownership, and everything else here is described by the revised plan, not written by it.
- **Updating `product/specs/`.** Specs describe shipped behavior; nothing in this plan is shipped.
- **Reworking `WorkspaceManager` or the project-level workspace lifetime.** The conversations path stops using it; nothing about `agent -w`/`harness -w` changes.

## Verification

- `./scripts/run.mjs check-diff`.
- Read the revised `product/plans/draft/conversations-plugin.md` end to end and confirm no remaining mention of a shared workspace, `provisionEmptyWorkspace`, `WorkspaceManager.createEmpty`, the reserved `conversations` workspace name, or the collision rule — and that every file path and line reference it cites still resolves in the current tree.
