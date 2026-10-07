<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the shell row's recorded label through collision-safe naming when restoring a sibling shell.

Existing Issue: `restoreSessionTabs` passes a sibling shell's recorded label directly to `reattach`, and `adoptRemotePluginTab` uses it as a fixed tab label, even when another live tab already holds that name. Severity: 6/10

Existing Risk: 5/10 - Attaching a session after opening another tab with the same label can create duplicate tab labels, making focus, close, and PTY ownership ambiguous.

Proposal Risk: 2/10 - Applying the existing `claimLabel` rule to every restored shell leaves only the normal, visible renamed-tab case when a saved label is already occupied.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1582: make restored shell labels collision-safe". In `src/sessions/restore-tabs.ts`, resolve every recorded shell label through `claimLabel` before calling `managers.plugins.reattach`, including sibling shells whose labels differ from `record.launchLabel`. Keep the de-duplication scoped to the new restored tab and preserve `record.launchLabel` only for session identity. Add a case to `src/sessions/shell-roundtrip.test.ts` with an existing tab using a sibling's saved label and assert the shell reattaches under a unique label without creating duplicate `Tab.label` values; verify the plugin still binds the recorded PTY id.

* Restrict recorded PTY adoption to the host-authorized reattach launch.

Existing Issue: The public `TabPluginTerminalOptions.recordedId` field flows directly into `registerRemotePty` for any remote plugin terminal, so a plugin can bind an existing PTY id from an ordinary launch or intent without using `remote.adopt` or the `reattach` hook. Severity: 9/10

Existing Risk: 1/10 - Before this change the plugin terminal resource always minted a new remote PTY id, so plugins could not replace the host's routing for a retained process through this API.

Proposal Risk: 1/10 - Hiding the id from ordinary plugin resource options and supplying it only through the host's validated adopt path restores the existing resource boundary; adoption remains available to the designated reattach flow.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1582: restrict recorded PTY ids to remote adoption". Remove `recordedId` from the public `TabPluginTerminalOptions` in `src/plugins/api.ts` and stop accepting it directly in `src/tab/remote-plugin-terminal.ts`. Carry the recorded id through a host-owned adoption context created by `adoptRemotePluginTab` in `src/plugins/launch-tab-remote.ts`, and have the host's scoped terminal resource pass that id to `registerRemotePty` only for the terminal factory of that validated adopt request. Keep ordinary remote launches and joined tabs on newly minted ids. Extend `src/plugins/launch-tab-remote.test.ts` or `src/tab/remote-plugin-terminal.test.ts` to prove ordinary plugin terminal creation cannot select an id while reattach binds the requested id; update the plugin API documentation so it describes the actual host-enforced boundary.
