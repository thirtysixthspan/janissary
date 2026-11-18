# Show saved launch names in the Sessions Host column

**Complexity: 5/10** — ~17 added production lines across 7 existing files, 15 test scenarios (p=5.589)

## Goal

Show the saved launch identity on Sessions rows for plain SSH and remote channels through their existing lifecycles. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-4-parked-endpoint.md`, `product/plans/ready/hosts-tab-6-remote-agent.md` and `product/plans/ready/hosts-tab-8-ssh-tab-launch.md`.

## Implementation

Add optional `hostName` to `RemoteSessionView` in `src/protocol/sessions.ts:21` and to `SessionRow` in `src/plugins/sessions/shared.ts:15`. Reuse `isOptionalString` in the existing row guard. The field is additive and the payload schema stays at 1. In `src/plugins/sessions/activate.ts:26`, copy it when present in `toPayload`, the adapter shared by the open and topic-update paths.

Trace the saved spelling from the original launch. Omit the field when it is absent.

- In `src/sessions/snapshot.ts:42` and `:62`, copy `entry.address.hostName` into the channel snapshot and `tab.harness.hostName` into the plain SSH snapshot. In `src/sessions/rows.ts:103` and `:126`, project those values through `liveRows` and `sshRow`. Every visible member of a shared channel uses the channel's recorded name across provisioning, reconnect, and join. Agent workspace reuse keeps the name of the channel it borrowed.
- In `src/sessions/rows.ts:150`, copy `record.hostName` into detached rows. The parked-endpoint plan restores the field into the channel at attach, so those rows then use the same live projection and retain the name even after the catalog entry is edited or removed.
- In `src/sessions/actions.ts:109`, copy `record.hostName` into `SessionTerminated` in `terminatedRowFrom`. Both a terminated attach result and successful parked termination use that snapshot before dropping the record. Carry the field through `terminatedRow` in `src/sessions/rows.ts:170` for rows that remain visible to be forgotten. The current filters still exclude ACP-only rows.

Render `row.hostName ?? row.host` in both Host cells in `web/src/plugins/sessions/SessionRowBody.tsx:12` and `:30`. Keep the bare host and original destination in the payload and continue deriving the tooltip from the full destination and workspace in `SessionList`. A literal launch keeps the bare-host label even if a catalog entry has that destination. The row module is about 149 code lines before this change under the skip-comment and skip-blank rule, giving headroom for the projection. If later changes remove that headroom, extract the existing SSH row helper into `src/sessions/ssh-rows.ts` before crossing 200 code lines.

## Tests and verification

Extend `src/sessions/snapshot.test.ts` for channel and saved SSH inputs. In `src/sessions/rows.test.ts`, cover live, joined, reconnecting, literal and saved SSH, detached and terminated rows. Extend the peer-refusal and successful parked termination fixtures in `src/sessions/manager.test.ts` to assert the name survives record removal. In `src/plugins/sessions/shared.test.ts` cover the optional string and reject an invalid type. In `src/plugins/sessions/activate.test.ts` assert the adapter preserves the name, and in `web/src/plugins/sessions/SessionList.test.tsx` assert the saved and literal rendering with the original tooltip in centre and docked layouts.

Update `product/specs/sessions-tab.md` with the launch-name lifetime and tooltip behavior. Run `$janissary/scripts/run.mjs check-diff`. With a scratch catalog, open a saved SSH tab and a remote shell through the same saved name, then open a literal SSH connection to the same destination. Open Sessions and confirm only the saved launches show the name. Detach the remote shell, remove the saved entry, and refresh Sessions. Confirm the labels and destination tooltips while the shell is parked and after reattaching it. Dock Sessions and compare the same rows there.

## Out of scope

New session types, live catalog matching and the Hosts tab.
