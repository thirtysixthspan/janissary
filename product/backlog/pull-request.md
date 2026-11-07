<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep docked image edits in the quit save walk after another sidebar entry is selected.

Existing Issue: After an edited image is docked beside Notifications and the Notifications row is selected, the image loses its unsaved marker and `quit` opens the plain quit dialog instead of asking to save the image. Severity: 8/10

Existing Risk: 8/10 - A user can confirm quit without seeing the image's save prompt, losing edits that the app previously recognized as unsaved.

Proposal Risk: 2/10 - Keeping the dirty handle registered for the open tab and covering the docked selection path in an integration test makes this failure visible and prevents the save walk from skipping the image.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "keep docked image edits in the quit save walk after another sidebar entry is selected". Trace how `web/src/plugins/image/useImageEdit.ts` registers and removes the dirty handle, including how `web/src/plugins/PluginBody.tsx` supplies the capabilities as the sidebar selection changes. Keep the edited image's dirty handle available while the image tab remains open even when another sidebar row is selected, and remove it when the image tab actually closes. Add a client integration test that edits an image, docks it beside Notifications, selects Notifications, then types `quit` and confirms the save walk reveals the image and opens its titled Save / Don't Save / Cancel dialog; verify Cancel leaves the app open and the edits intact. Keep existing image save, undo, and plain quit behavior covered, and run the required diff-scoped checks.
