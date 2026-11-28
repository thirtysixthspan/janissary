# Route a restored harness's MCP questions to its rebuilt tab

**Complexity: 3/10** — About 26 added lines across five production files, with four requirements (p=4.82).

## Goal

Preserve a remote harness's access to its own tab after Attach gives the tab a different name. Keep addressing an explicit other tab available through its label or alias.

## Requirements

1. “A call for its original launch label addresses the exact rebuilt tab” when the original label is occupied after Attach.
2. The exact rebuilt tab remains the target when “an alias belongs to another tab”.
3. “Preserve the existing arbitrary label and alias lookup for other explicitly named tabs”.
4. Preserve “the untouched local HTTP route”.

## Design decisions

- Carry the saved MCP launch decision on the harness's resume request. Combine it with the workspace label, which is what the far process still holds as `JANISSARY_TAB`.
- Bind that name to the rebuilt tab label and its harness payload at channel creation. The payload survives tab renumbering and prevents a later tab reusing the label from inheriting the binding.
- Put the name resolution in the question executor and pass the binding only for a restored MCP harness. Other names use the existing lookup.

## Preserved behavior

1. A local `question` call resolves aliases case-insensitively. It must never use a remote session's binding. Existing test `resolves an alias to the tab and registers against its label` in `src/mcp/executor.test.ts`.
2. Attach restores the same far-side process. It must never launch a replacement for the label change. Existing test `restores the same harness through two cycles without closing the tab or losing its row` in `src/sessions/harness-roundtrip.test.ts`.

## Assumptions

1. `src/remote/serve-processes.ts:168` passes `label: this.label` to the far-side environment builder.
2. `src/sessions/attach.ts:88` uses `uniqueLabel` to pick the rebuilt tab label, while `src/sessions/attach.ts:102` retains `record.workspaceLabel`.
3. `src/harness/tab-spawn.ts:60` calls `insertTabInGroup` before it creates the remote channel.
4. `src/tab/utils.ts:4` uses a shallow copy to `renumberTabs`, keeping the same nested harness payload.

## Existing functionality

1. `src/tab/lookup.ts:25` defines `byLabelOrAlias` for case-insensitive explicit tab names.
2. `src/remote/mcp-relay.ts:26` builds the shared MCP question executor with `createLocalExecutor`.

## Implementation steps

Extend the remote resume record with the adopted process's saved MCP setting. At remote entry creation, bind its workspace label to the rebuilt tab when that setting is enabled, and pass the binding through the relay to the local question executor. For a binding match, resolve the exact rebuilt label and require its current harness payload to match the one originally bound. For other names use the existing lookup. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. A question naming the restored remote harness's original label opens on its rebuilt tab even when another tab has taken the original label.

## Tests

- In `src/sessions/harness-roundtrip.test.ts`, detach an MCP-enabled harness, occupy its original label, add an unrelated tab alias matching the rebuilt label, and attach. Check that a relayed question naming the original name still registers on the rebuilt tab after another tab opens for requirements 1 and 2. Check that explicitly naming that new tab's alias opens its question for requirement 3.
- In `src/mcp/executor.test.ts`, check that a call using the original name after the bound tab closes gets the usual missing-tab result when a new tab reuses its label. Preserve the existing local alias test for requirement 4.

## Out of scope

Remote MCP transport authorization and reply retention have their own work items.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Launch an MCP-enabled remote harness, detach it from Sessions, then open another tab with the original label. Attach the harness and ask it to open a Janissary question on its own tab. The panel opens on the restored harness tab even though its label now has a suffix. Ask the same harness to direct a different question to an unrelated tab by that tab's display alias, and confirm it opens there.
