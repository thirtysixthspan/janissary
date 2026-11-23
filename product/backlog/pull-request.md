<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Pin the not-recording fact's path from the tab envelope to the drawn flag on both the plugin row and the harness row, which is untested plumbing this diff introduces.

Existing Issue: The client plumbing that carries `recordingOff` (`web/src/plugins/PluginBody.tsx` into `usePluginCapabilities`'s `Pick` list and memo dependencies, then `createPluginClientCapabilities`, and `web/src/harness/HarnessTab.tsx` into `HarnessTabMeta`) has no test, because the new tests render `ShellTabMeta` and `HarnessTabMeta` with the value already supplied, while `recording`'s equivalent path is pinned by `web/src/plugins/DockedPluginBody.test.tsx` "hands a docked plugin the recording its envelope carries". Severity: 3/10

Existing Risk: 4/10 - Dropping any one of the forwarding sites in a later refactor leaves a shell or harness tab that never records drawing the plain `recording` flag, and every existing unit test still passes.

Proposal Risk: 1/10 - The path is pinned end to end at the two entry points, so what remains is a third row drawing the flag outside these components, which would be new code with its own tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2199 "pin recordingOff's path from the tab envelope to the drawn flag". In `web/src/plugins/DockedPluginBody.test.tsx`, extend the stub plugin body's data attributes with `recordingOff` and add "hands a docked plugin recordingOff when its envelope carries it" and "omits recordingOff when its envelope does not", modeled on "hands a docked plugin the recording its envelope carries". In `web/src/plugins/plugin-client-capabilities.test.ts`, add a case that `createPluginClientCapabilities` includes `recordingOff` only when it is `true`, independently of `recording`, and never supplies `openRecording` because of it. In `web/src/harness/HarnessTab.test.tsx`, add a case that a harness view carrying `recordingOff: true` renders the flag with the title `not recording` and no button, and that one without it keeps the title `recording`. No production change is expected; if a test exposes a missing forward, fix that site in the same work. The existing `web/src/shared/RecordingFlag.test.tsx`, `web/src/harness/HarnessTabMeta.test.tsx`, and `web/src/plugins/shell/ShellTabMeta.test.tsx` cases must keep passing untouched.
