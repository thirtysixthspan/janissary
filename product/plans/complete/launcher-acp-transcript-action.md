# Launcher: remove the ACP response section and open its transcript

**Complexity: 5/10** — remove the launcher's response consumer, add one scoped client capability for opening its own ACP transcript, and verify both the action and absence of the inline response.

## Goal

Keep the launcher's ACP session available to its summarizer while removing the ACP response section from the launcher body and providing a clipboard-icon metadata action that opens its transcript in an editor tab.

## Approach

Add an optional client capability that opens the ACP transcript for the plugin tab identified by the host. The launcher uses it from its metadata bar, without receiving the raw client or choosing another tab's transcript. Remove the launcher's `useAcpResponse` consumer and update the launcher and plugin API documentation.

## Implementation steps

1. Add and test the scoped `openAcpTranscript()` client capability.
2. Add the launcher metadata button, remove its inline ACP response section, and cover the interaction and hidden response behavior.
3. Update the launcher functional spec and the developer-facing plugin API documentation.
4. Promote this plan and remove the completed backlog entry.

## Tests

- Verify `openAcpTranscript()` sends the RPC for the calling plugin tab's label.
- Verify the launcher button invokes that capability and the launcher does not render the ACP response surface.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Removing or changing the launcher's ACP session or summarizer.
- Removing the launcher's command bar.
- Changing ACP transcript generation or behavior for other tabs.
