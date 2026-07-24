# issues

## ready

* fix this test warning:
 ✓  client  web/src/editor/useEditorSuggest.test.ts (18 tests) 1095ms
stderr | web/src/EditorTab.test.tsx > EditorTab > renders the provisioning sync status icon for a synced tab not yet filled in, without loading content
An update to ForwardRef(EditorTab) inside a test was not wrapped in act(...).
When testing, code that causes React state updates should be wrapped into act(...):
act(() => {
  /* fire events that update state */
});
/* assert on the output */
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act

* add claude opus 5 to harness-models, removing prior versions.

## development

## deferred
