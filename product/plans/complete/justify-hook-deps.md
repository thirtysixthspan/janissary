# Document intentional hook dependencies

Complexity: 3/10

## Goal

Make the six bare `react-hooks/exhaustive-deps` suppressions currently remaining in `web/src/` explain the dependency boundary they preserve, so future changes can distinguish deliberate trigger selection from an accidental stale closure. Two stale `EditorTab.tsx` line references in the backlog no longer contain suppressions.

## Approach

Keep each effect's existing dependency list because refs or stable lifecycle inputs already carry the mutable values. Add a concise trailing reason to each suppression, matching the documented form already used in `FileNavigatorTab.tsx`.

## Implementation steps

1. Add reasons to the suppressions in `useFocusOnTabSwitch.ts`, `useXterm.ts`, `EditorTab.tsx`, `editor/useEditorWatchReload.ts`, `editor/useEditorSuggest.ts`, and `editor/useEditorFile.ts`.
2. Review the resulting dependency comments for accuracy and run the affected web tests and diff gate.

## Tests

- Run `./scripts/run.mjs check-diff` after each implementation step.
- Run the existing focused hook/editor tests; no runtime behavior changes are expected, so no new test case is required.

## Specs and documentation

No user-visible behavior changes. Functional specs, `help.md`, and public documentation remain unchanged.

## Out of scope

- Changing any dependency array or effect trigger.
- Editing the separately documented `FileNavigatorTab.tsx` suppression or unrelated non-bare hook suppressions.
