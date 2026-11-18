# Require the injected plugin host on the editor tab

**Complexity: 2/10** — ~3 added lines in 1 production file, 3 requirements and 3 test scenarios, no new production units (p=3.67); a localized prop-requiredness refactor with no architecture change.

## Goal

`EditorTab` currently builds its own fallback host with `createEditorPluginHost(() => {})` in a `useMemo` whenever no `pluginHost` prop is injected. That no-op callback discards every disabled-plugin report, so a render that forgets to inject the host runs with a broken plugin and shows no sign of it, and it duplicates `useEditorPluginHost`, the hook that owns the one session host and its report queue. The fix makes `pluginHost` and `pluginReports` required props, deletes the fallback and the `createEditorPluginHost` import from the component, and passes the injected host straight to `useEditorPlugins`. The single production caller (`MountedViewLayers`) already injects both. No user-visible behavior, protocol message, or imperative handle changes.

## Approach

In `web/src/editor/EditorTab.tsx`, drop the `createEditorPluginHost` value import (keep the `EditorPluginHost` type import) and the now-unused `useMemo` React import. Make `pluginHost` and `pluginReports` required by removing their `?`, and rewrite the prop comment to say the host and queue are injected by the composition that owns the tabs. Delete `const ownHost = useMemo(() => createEditorPluginHost(() => {}), []);` and change the `useEditorPlugins` call to pass `pluginHost` instead of `pluginHost ?? ownHost`.

`web/src/MountedViewLayers.tsx` already passes `pluginHost={editorPluginHost}` and `pluginReports={editorPluginReports}` from `useEditorPluginHost()`, so it needs no change.

Update the three test files that render `EditorTab` without the host so every mount supplies one. In `web/src/editor/EditorTab.test.tsx`, add a `forwardRef` fixture wrapper that omits the two new-required props and injects its own fresh host and reports array, then repoint the existing `EditorTab` JSX through it. In `web/src/editor/EditorTab.window-keys.test.tsx` and `web/src/useSectionNav.editor.test.tsx`, inject a host and reports in the existing `ui()` and `Harness()` fixtures. Add a focused test proving the component actually uses the injected host and drains the injected report queue, so a regression back to an internal fallback is caught.

## Implementation steps

1. In `web/src/editor/EditorTab.tsx`, change the React import from `..., useMemo, ...` to drop `useMemo`; change `import { createEditorPluginHost, type EditorPluginHost }` to `import type { EditorPluginHost }`; remove the `?` from `pluginHost` and `pluginReports` and rewrite their comment; delete the `ownHost` line; change `pluginHost ?? ownHost` to `pluginHost` in the `useEditorPlugins` call. Run `$janissary/scripts/run.mjs check-diff` — expect the three test files to fail typecheck until step 2.
2. In `web/src/editor/EditorTab.test.tsx`, import `useMemo`/`useRef`, `createEditorPluginHost`, and `PluginReport`; define a `TestEditorTab` `forwardRef` fixture whose props are `Omit<React.ComponentPropsWithoutRef<typeof EditorTab>, 'pluginHost' | 'pluginReports'>` and that injects a memoized `createEditorPluginHost(() => {})` and a fresh `useRef<PluginReport[]>([]).current`; replace every `<EditorTab` JSX usage with `<TestEditorTab`. Run `$janissary/scripts/run.mjs check-diff`.
3. In `web/src/editor/EditorTab.window-keys.test.tsx` and `web/src/useSectionNav.editor.test.tsx`, import `createEditorPluginHost` and inject a host plus a `PluginReport[]` into the `ui()` / `Harness()` renders. Run `$janissary/scripts/run.mjs check-diff` — the suite should be green again.
4. Confirm `EditorTab.tsx` stays under the 200-line `max-lines` limit (this change removes lines) and that no `EditorTab` JSX call site remains without the host (verify with a repo-wide search before finishing).

## Tests

- `web/src/editor/EditorTab.test.tsx` — add a case that renders `EditorTab` directly with an explicit injected host stub (a `bindings()` spy returning one binding and a `run` spy resolving `{ status: 'ok', result: null }`) and a seeded `pluginReports` array. Assert the seeded report is drained to `client.send` as an `editorPluginFailed` message with the injected tab URL, and that firing a chord the stub claims calls its `bindings()` and `run()` — proving the component uses the injected host and queue rather than a private fallback. Keep every existing case passing through the `TestEditorTab` fixture.
- `web/src/editor/EditorTab.window-keys.test.tsx` and `web/src/useSectionNav.editor.test.tsx` — keep all existing cases passing with the host injected in their fixtures.

## Spec

No spec change. This is an internal refactor: the editor's plugin-disable notification behavior is already recorded in `product/specs/editor-plugins.md` and `product/specs/editor-tab.md`, and no user-observable behavior changes. Spec files must not describe a component's props or how its host is constructed.

## Out of scope

- Changing `useEditorPluginHost`, `createEditorPluginHost`, `useEditorPlugins`, or `MountedViewLayers` — the host already exists and is already injected at the production call site.
- Changing the `editorPluginFailed` wire contract, the plugin registry, chord tables, or any user-visible editor behavior.
- Updates to `help/`, `documentation/user-documentation/`, or any spec: no user-visible behavior changes.
