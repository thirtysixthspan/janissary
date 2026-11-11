# ACP tool loop 27 — end-to-end verification

**Complexity: 2/10** — no production code, 10 requirements, 16 manual scenarios (p=4.31)

Run order: 27 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Verification"; "Out of scope"). Depends on subplans 1 through 26.

Each earlier subplan proves its own piece with unit tests. This one proves that the pieces meet: a real remote host, a real far-side loop, local caller tools, and the typed command all working together. It also checks that nothing listed as out of scope crept in. It changes no code. A failure found here is fixed in the subplan that owns the behavior, on the same branch, and this list is rerun.

## Setup

Use a remote shell tab on a host running this build, so both ends speak protocol 40. Its clone must have a file the local checkout lacks, for example a new `notes/remote-only.md` committed only on the remote. Keep the role defaults from a freshly created roles file, so `ask` and `tell` grant `file read`, or grant it by hand in the roles tab.

## Steps

1. `$janissary/scripts/run.mjs check-diff` passes on the finished branch.
2. On the remote tab, `tell read notes/remote-only.md and summarize it`. The transcript shows a `[<host>] file read notes/remote-only.md` tool step and a correct summary. The connection record shows both `tool` activity lines tagged `[<host>] `.
3. On the remote tab, type `file read notes/remote-only.md --limit 3`. It prints three numbered lines and the continuation notice, untagged.
4. On the remote tab, `tell create a sqlite database named probe`. `probe.sqlite` appears under the local `.janissary/db/sqlite/` and in the local connections panel, and the step is untagged.
5. On the remote tab, `ask` something that makes the agent emit `question ask …`. The question panel appears locally, and the answer reaches the remote agent, which uses it in its reply.
6. On the remote tab, start a long `tell`, then `tell reset` mid-run. The prompt settles at once and no further tool step appears.
7. On a local tab, `file read .env` prints `Secret file: .env.` and `file read ../x` prints `Outside the workspace: ../x.`.
8. Run `agent <task> on <host>` with a skill granting `file`, asking it to read `notes/remote-only.md`. The monitor activity shows `[<host>] file read notes/remote-only.md` on both lines, and the run completes with the file's content in its answer.
9. In the commands tab, turn off Agent access for `db sqlite create`, then run `tell create a sqlite database named probe2` on the remote tab. The step answers `Command is disabled: db sqlite create.`, a `command-disabled` notification appears locally, and the step is untagged.
10. Drop the remote connection while a `tell` is running, for example by killing the ssh process. The prompt settles with `Remote connection lost.`, and after reconnecting the next `ask` starts a fresh session.

## Out-of-scope checks

Confirm each of these still holds:
- `db`, `browser`, and `question` never run on the remote host.
- No remote database or browser appears in the local connections panel or the sql tab.
- No `file write` or `file edit` tool exists.
- A far-side loop does not survive a transport loss, and no loop event is replayed on reattach.
- Monitors, conversations, and editor persona queries behave as before.
- Typed `file read` output and caller-side steps carry no host tag.

## Out of scope

Code, test, spec, or doc changes; those belong to the subplan that owns the behavior.

## Verification

This subplan is its own verification. Record the outcome of each step in the pull request description.
