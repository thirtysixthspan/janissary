# Confine launch labels before leftover cleanup

Issue (PR 1175 backlog): Confine launch labels before automatic leftover cleanup can remove a directory outside the workspace base.

Complexity rating: 4/10

## Goal

The leftover cleanup added on this branch passes a launch label straight into `workspacePath` and recursively removes whatever path comes out. A typed harness label (`harness claude as ../victim -w`), an agent name, a profile entry's `name`, or a remote `provision` frame's label can carry `..` or a path separator, so the resolved path can land outside `.janissary/workspace` and the cleanup deletes it before the clone fails. A label that becomes a workspace folder must name exactly one child of the workspace base, and anything else is refused before any existence check, removal, or clone.

## Approach

One pure rule, shared by every path that turns a label into a workspace folder: `workspaceLabelError(label)` in a new `src/workspace/label.ts` returns why a label cannot name a single folder directly under the workspace base (empty, `.`, `..`, or containing `/`, `\`, or a NUL), or undefined when it can.

- **Leftover helpers guard themselves.** `removeLeftoverWorkspace` returns the rule's reason without touching the filesystem when the label fails it, and `hasLeftoverWorkspace` answers false. Any future caller that forgets the up-front check still cannot delete outside the base.
- **Local launches refuse up front.** `resolveLocalLaunchName` checks an explicit name for a `-w` launch before the name check runs, posting `Cannot launch "<name>": <reason>.` as a `launch-refused` notification and returning undefined, so nothing is checked, removed, or cloned. Default names (bare harness names, their `-2` suffixes, pool names) come from fixed safe sets and need no check. The typed `harness … as <label>` path and the profile harness entry path both reach this through `HarnessManager`, and a typed `agent <name> -w` reaches it through `newAgentOp`. Launches without a workspace keep accepting any display label.
- **Remote provisioning refuses up front.** `provisionRemoteWorkspace` checks the label before the running check and answers `workspace-failed` with the same refusal line, provisioning nothing. The frame decoder stays as it is: a malformed-frame refusal would hide the reason.

## Implementation steps

1. Add `src/workspace/label.ts` with `workspaceLabelError`.
2. Add `invalidNameRefusal(name, reason)` to `src/launch-name/messages.ts`.
3. Guard `removeLeftoverWorkspace` and `hasLeftoverWorkspace` in `src/launch-name/leftover.ts`.
4. Refuse an explicit invalid `-w` name at the top of `resolveLocalLaunchName` in `src/launch-name/local.ts`.
5. Refuse an invalid label at the top of `provisionRemoteWorkspace` in `src/remote/serve-provision.ts`.

## Tests

- `src/workspace/label.test.ts`: ordinary labels pass; empty, `.`, `..`, `../x`, `a/b`, `a\b`, and a NUL-bearing label fail.
- `src/launch-name/leftover.test.ts`: a sentinel directory beside the workspace base survives `removeLeftoverWorkspace('../sentinel')`, which returns the reason, and `hasLeftoverWorkspace('../sentinel')` is false; the existing leftover cases stay.
- `src/harness/manager.test.ts`: `harness claude as ../victim -w` and a profile entry named `../victim` post the refusal and never call the leftover helpers or `workspace.create`, and open no tab; `harness claude as ../victim --no-workspace` still opens.
- `src/remote/serve.test.ts`: a `provision` frame labeled `../sentinel` answers `workspace-failed` with the refusal and leaves a sentinel directory outside the workspace base intact.

## Out of scope

- A label naming another workspace's scratch sibling (`foo.tmp`); it stays inside the base.
- Refusing an invalid remote label on the local side before the ssh connection opens; the host's answer already closes the placeholder with the reason.
- Case-only label aliasing on the host filesystem (a separate backlog entry).

## Specs and docs

- `product/specs/workspaced-agent.md`, `product/specs/harness.md`, `product/specs/remote-server.md`: state that a workspace name must be a single folder name and how an invalid one is refused.
- `help.md` and `documentation/user-documentation/`: checked; no existing text describes label characters.
