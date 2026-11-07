<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the promised quit save walk after docking an edited image beside another sidebar entry.

Existing Issue: Docking an edited center image unmounts its `PluginTabLayer` and mounts a new `DockedPluginBody`, so `useImageEdit` unregisters its dirty handle and resets its local edit model before the promised docked quit flow. Severity: 8/10

Existing Risk: 8/10 - A user who docks an edited image can lose its in-memory edits without seeing a save prompt, and the new integration case misses this path by starting with the image already docked.

Proposal Risk: 2/10 - Carrying the image edit state and dirty handle across the center-to-sidebar move, with a test that performs that move, makes the save walk cover the user's edits before quit.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "preserve edited image state when docking before quit". Trace how `MountedViewLayers` excludes docked tabs from `PluginTabLayer` and how `Sidebar` mounts `DockedPluginBody`; the move unmounts the `ImageTab`, whose `useImageEdit` state is local and whose effect cleanup unregisters the dirty handle. Keep the edit model and dirty handle associated with the open image tab across that move, and remove the handle only when the tab closes. Extend the `App.test.tsx` integration case to start with an editable center image, rotate it, dock it beside Notifications, select Notifications, enter `quit`, verify the titled Save / Don't Save / Cancel dialog, cancel, and verify the edit remains available. Keep the existing docked-selection case, image save and undo coverage, and plain quit behavior covered, then run the required diff-scoped checks.
