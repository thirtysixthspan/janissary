# Authenticate ACP outside workspaces

Complexity: 3/10

## Goal

Allow ask/tell in ordinary shells to use the saved ChatGPT login through OpenCode.

## Approach and implementation steps

1. Add an ACP-owned private credential preparation helper using the existing OAuth bridge. Allocate only when a saved login exists, preserve explicit launch environment overrides, and remove credentials when the process exits or fails to spawn. Keep workspace credential provisioning unchanged.
2. Test private OAuth preparation, absent credentials, explicit overrides, and cleanup. Run check-diff after each step.
3. Update ACP and workspace specs and existing public OAuth documentation where affected, promote this plan, remove the resolved entry, and ship through the merge workflow.

## Tests

Verify owner-only private credentials contain the cached login; no override when absent; workspace path remains unchanged; explicit environment overrides win; cleanup removes the private directory.

## Out of scope

Changing sandbox policy, forwarding ChatGPT credentials remotely, changing token precedence, or editing other backlog entries.
