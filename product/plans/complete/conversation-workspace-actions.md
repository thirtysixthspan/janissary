# Add conversation workspace actions

**Complexity: 5/10** — the two controls reuse existing file-navigator and agent-placement behavior, but their requests cross the web plugin boundary and the host's narrow conversation topic before reaching the durable conversation workspace. The change therefore touches the chat view, plugin action contract, conversation manager, profile manager, focused tests, and the conversation/plugin/sandbox specs without introducing a new subsystem.

## Goal

Add file-navigator and new-agent buttons to each conversation tab's metadata row. Both actions must use that conversation's private workspace, and an agent launched there must carry the workspace as its sandbox boundary.

## Approach

Render the same folder and plus glyphs used by ordinary agent metadata, grouped with the existing split action. Send empty `open-files` and `launch-agent` intents through the chat plugin, map them to explicit conversation topic actions, and let `ConversationsManager` resolve the open chat tab that owns the conversation.

Before either host action runs, ensure the conversation workspace exists, persist a still-empty new conversation so that workspace is not left orphaned across a restart, and associate the chat tab's cwd with the private workspace. The file action delegates to the existing open-or-retarget behavior. The agent action delegates to a narrow profile-manager entry point that places an ordinary agent tab in the chat tab's group with both cwd and `workspaceDir` set to the conversation workspace; it deliberately does not register that durable conversation-owned directory with the project-workspace lifecycle.

## Implementation steps

1. Add folder and new-agent controls to `ChatTab.tsx`, disabled for a deleted conversation, and emit the two new empty intents.
2. Extend the chat plugin intent mapping and the declared conversation topic actions, then route those actions to the conversation manager.
3. Add conversation-manager workspace targeting plus a profile-manager method that places a grouped agent directly in the supplied durable workspace.
4. Run `./scripts/run.mjs check-diff` after each implementation step and resolve every failure before continuing.
5. Add focused view, plugin-intent, topic-routing, conversation-manager, and profile-manager tests for the new behavior, then rerun `./scripts/run.mjs check-diff`.
6. Update the conversation, tab-plugin, and sandbox functional specs, verify that help and public documentation do not already describe conversation metadata controls, and rerun `./scripts/run.mjs check-diff`.

## Tests

- Clicking the folder and plus controls emits `open-files` and `launch-agent` with empty payloads; both controls are disabled for a deleted conversation.
- The bundled chat server maps both intents to their exact conversation topic actions.
- The conversation topic routes both actions to the conversation manager.
- A workspace action on an open new conversation creates its private workspace, persists its empty record, targets the chat tab cwd, and delegates file navigation and agent launch to that workspace; a conversation without an owning open chat tab is refused.
- A direct workspace launch creates an ordinary agent in the source tab's group with cwd and sandbox workspace set to the supplied directory, without retaining it as a project workspace.

## Out of scope

- A general-purpose plugin capability for opening arbitrary file navigators or agents.
- Changing the conversation ACP agent, model selection, or response lifecycle.
- Keeping a deleted conversation workspace alive for file or agent tabs that were opened before deletion.
- Changing file-navigator retargeting, agent naming, or Seatbelt availability rules.
- Adding new help or public-documentation sections for conversations that those documents do not currently cover.

## Verification

- `./scripts/run.mjs check-diff` passes after implementation, tests, and spec updates.
- PR #952 remains open and receives the completed commit on `feature/conversations-plugin`.
