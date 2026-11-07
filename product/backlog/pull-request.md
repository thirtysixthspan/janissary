<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle an image save that finishes after the center body remounts in a sidebar.

Existing Issue: `useImageEdit.save()` updates `savedOperations` only through local React state after awaiting `save-edit`, so a center-to-sidebar remount during that request restores the old dirty snapshot and never receives the completion. Severity: 4/10

Existing Risk: 4/10 - A save started just before docking can write the image successfully yet leave the tab marked unsaved, prompting a redundant save walk or letting the user discard a view they believe has already been saved.

Proposal Risk: 2/10 - Reconciling an in-flight save completion with the current tab state and dirty handle across placement remounts removes the stale dirty prompt while preserving failed-save and edit-during-save behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "preserve image save completion across docking". In `web/src/plugins/image/useImageEdit.ts`, `save` awaits `capabilities.intent('save-edit')` and then updates `savedOperations` through hook-local state, while `tabState` is read only when the hook mounts and written from a passive effect. If `PluginTabLayer` unmounts between the request and its response, `DockedPluginBody` restores the pre-save snapshot and registers a dirty handle from it; the old component's completion cannot update that new body. Extend the per-tab state and dirty-handle lifecycle so a successful in-flight save updates the snapshot and active handle for the still-open label across a placement remount, while a failed save and edits made after the request starts remain dirty. Add an App integration test that holds `save-edit` unresolved, docks the image before resolving it, then verifies the completed save clears the unsaved marker and a subsequent quit has no save dialog. Keep the existing image editor tests for failed saves and edits made while a save is in flight.
