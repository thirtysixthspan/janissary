# Rename the chat plugin and command to conversations

**Complexity: 5/10** — the behavior stays the same, but the old name is embedded in the server plugin identity and loaders, client entry and styling, conversation-manager ownership checks, tests, and two functional specs. The rename is mechanical and requires no new architecture.

## Goal

Use `conversations` everywhere the bundled conversation feature is named. The `conversations` command should open, dock, and address the conversation list, while `chat` should no longer be registered.

## Approach

Rename the concrete plugin from `chat` to `conversations` across both plugin trees and every live consumer. Replace Chat-prefixed payload, component, helper, and style names with conversation-specific names, change the plugin id, tab label prefix, singleton key, title, and command to `conversations`, and bump the plugin's own version to 2.0.0 because its public command and stable identity change without a compatibility alias.

Keep the conversation topic and durable `src/conversations/` subsystem unchanged because they already use the desired name. Historical completed plans remain an accurate record of the earlier design, and the separate integrations backlog use of “chat” describes an external data-source category rather than this feature.

## Implementation steps

1. Rename `src/plugins/chat/` and its manifest, shared types, guards, activation identifiers, messages, fixtures, catalog entry, loader entry, and conversation-manager plugin ownership checks to `conversations` terminology.
2. Rename `web/src/plugins/chat/` to `web/src/plugins/conversations/`, including the conversation tab component, list-key helpers, stylesheet, CSS selectors, tests, imports, lazy loader, and registry entry.
3. Run `./scripts/run.mjs check-diff` and resolve any failures from the coordinated rename.
4. Add a focused command-registry test proving `conversations` is registered and `chat` is absent.
5. Run `./scripts/run.mjs check-diff` and resolve any failures.
6. Update `product/specs/conversations.md` and `product/specs/tab-plugins.md` so the plugin identity, command grammar, and profile wording use only `conversations`.
7. Run `./scripts/run.mjs check-diff` and resolve any failures.

## Tests

- The application command list contains `conversations` and does not contain `chat`.
- Renamed server plugin tests continue to cover opening, docking, title lookup, intents, notifications, rejections, and failure messages under the `conversations` identity.
- Renamed client tests continue to cover conversation list and tab behavior, payload validation, registry loading, and conversation-prefixed styling.

## Out of scope

- Keeping `chat` as a compatibility alias.
- Changing conversation storage, sessions, workspaces, models, or user interaction behavior.
- Rewriting historical completed plans that describe the feature's original `chat` design.
- Changing unrelated uses of “chat” that refer to external integration categories or user-provided text.

## Verification

- `./scripts/run.mjs check-diff` passes after the rename, focused test, and spec updates.
- A live-source search outside historical plans and unrelated backlog text finds no `chat` identifiers or paths.
