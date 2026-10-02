# Grant a member's own-tool approval only under real confinement

**Complexity: 3/10** — one decision in `connect`, reusing a helper that already exists, plus the refusal path beside it. The security premise of the whole feature is what is being restored, so the tests matter more than the lines.

## Goal

A multi-agent member's agent is the only ACP connection in the application whose own tool calls are approved, and that approval is unconditional. The confinement it depends on is not.

`MultiAgentSessions.connect` in `src/multiagent/sessions.ts` passes `ownTools: true` on every member connection. But `sandboxSpawn` in `src/sandbox/index.ts` returns its command and arguments unchanged — no Seatbelt profile, no secret-path deny, no network deny — whenever there is no `workspaceDir`, whenever the `sandboxWorkspaces` config toggle is off, and whenever `sandbox-exec` is not on the host, which on any non-darwin machine is every spawn. On such a host a member's agent gets every tool call approved and no boundary enforcing anything, against a clone of the user's own repository and with `HOME` set.

That combination does not exist anywhere else in the application, which is why it went unnoticed: an ordinary workspaced tab's ACP agent has the same absent sandbox and no approved tools, so it can do nothing either way. This feature is the first path where "no sandbox" stops being harmless.

## Approach

Decide the grant from whether this spawn will actually be confined, rather than passing `true` outright, and refuse the member when it will not be.

`src/sandbox/index.ts` already exports the two facts needed: `sandboxAvailable()` and `sandboxNotice()`, the latter returning the one-line reason a workspaced tab's transcript carries when its processes will not be confined. Together with the presence of the member's directory they are exactly the `confinable` test `sandboxSpawn` applies internally, so a check here cannot drift from the behaviour it is guarding.

Refusing rather than degrading is deliberate. A member exists to work in a disposable clone; run unconfined, it is an agent with unrestricted tool approval pointed at the user's repository, which is a worse outcome than a row that reads `failed` and says why. `provisionMembers` already treats a member it cannot provision exactly that way.

## Implementation steps

1. In `src/multiagent/sessions.ts`, import `sandboxAvailable` and `sandboxNotice` from `../sandbox/index.js`.
2. At the top of `connect`, compute whether this member can be confined: its directory is set, `sandboxAvailable()` is true, and `sandboxNotice()` is undefined. `sandboxNotice` already folds in the `sandboxWorkspaces` toggle, so consulting both it and availability covers every condition `sandboxSpawn` applies.
3. When it cannot, mark the member `failed` with `sandboxNotice()`'s reason — falling back to a sentence naming the missing workspace when the directory is the thing absent, since `sandboxNotice` says nothing about that case — return, and open no session.
4. Pass `ownTools: true` only on the path that survived.
5. Say so in the specs. `product/specs/multi-agent-tab.md`'s "What a member does" currently states the confinement without qualifying it, and `product/specs/sandbox.md` records that a member's process is confined to its clone; both now need the condition under which that holds and what happens when it does not.

## Tests

In `src/multiagent/sessions.test.ts`:

- A member with a directory, on a host reporting isolation available, is spawned with `ownTools: true`. This is the existing case and it must keep passing.
- A member on a host reporting isolation unavailable is not spawned at all: `connectAcp` is never called, the member reads `failed`, and the reason is `sandboxNotice`'s.
- A member with no directory is not spawned, and its reason names the missing workspace.
- `ownTools` is never set on a connection that was spawned without confinement, asserted by the absence of the spawn itself.

The sandbox helpers read module-level state and the host's filesystem, so these cases need `sandboxAvailable` and `sandboxNotice` mocked alongside the existing `connectAcp` mock — `vi.hoisted` plus `vi.mock('../sandbox/index.js', …)`, the same shape the file already uses for the ACP connection. Nothing in `src/acp/tools.ts` changes: the decision mode itself is unchanged, only who is allowed to ask for it.

## Out of scope

- **Refusing a member with no directory.** That is the next backlog entry, and it stands on its own as a fail-open guard regardless of this one.
- **Changing when a workspaced tab warns.** `sandboxNotice` is already surfaced for those; this only reads it.
- **Any change to the ordinary agent tab's tool handling**, which continues to cancel every request.

## Verification

```
./scripts/run.mjs check-diff
```

Then, with the app running: set `sandboxWorkspaces: false` in the project config, start a two-model `fanout`, and confirm no clone is used to run an agent and both rows read `failed` with the isolation-off reason. Restore the config and confirm a normal run still works and that each member's process arguments still carry `sandbox-exec`.
