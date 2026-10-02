# Document the metadata row's provisioning indicator

**Complexity: 1/10** — two prose additions to existing user-documentation paragraphs. No code.

## Goal

The pull request adds a spinning "Provisioning workspace" icon to the metadata row while a workspace is being provisioned, but the user documentation pages that already describe the clone wait and the remote tab's metadata row do not mention it. `ai/guidelines/user-documentation.md` asks that a user-visible behavior change update its doc page in the same pull request.

## Approach

Extend the two paragraphs that already describe this moment, using the wording of the "Provisioning indicator" subsection of `product/specs/tabs.md`. User-visible behavior only; sprite placement untouched.

## Implementation steps

1. `documentation/user-documentation/advanced-agents/workspaced-agent.md` — in the paragraph beginning "The tab appears right away, marked busy, while the clone runs in the background", add that the tab's metadata row shows a spinning arrows icon (tooltip "Provisioning workspace") while the clone runs, and that it disappears once the clone completes or fails.
2. `documentation/user-documentation/advanced-agents/remote-agents.md` — in the paragraph describing the host chip at the left of the metadata row, add that the same spinning icon shows until the host reports its workspace ready.

## Tests

None: markdown only. `npm run docs:build` confirms both pages still build.

## Out of scope

- Screenshots of the indicator.
- Any page that does not already describe the clone wait or the remote metadata row.

## Verification

- `./scripts/run.mjs check-diff`
- `npm run docs:build`
