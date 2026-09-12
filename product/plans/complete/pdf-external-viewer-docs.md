# Document the PDF external viewer setting

Complexity: 1/10.

## Goal

Configuration documentation identifies the video, audio, and PDF readers of the plugin-keyed external viewer map.

## Approach and implementation

1. Correct the externalViewers row in product/specs/application-config.md and the existing startup configuration table in documentation/user-documentation/getting-started/startup.md. Preserve defaults, missing/empty-entry fallback, whole-map replacement, and manual configuration semantics.
2. Run check-diff and existing configuration/PDF opener tests, complete this plan, and remove the resolved entry.

## Tests

Cross-check createPluginContext, audio/PDF activation, the shared configured-viewer helper, and the open spec. No existing test asserts the documented reader list, so add no prose-pinning test. Run existing config and PDF activation tests.

## Out of scope

Runtime configuration changes, new documentation pages, and PR description edits.
