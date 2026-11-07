<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Focus the PDF tab before reopening find with Cmd+F after a tab switch

Existing Issue: Generated Step G3 did not reopen PDF find when Cmd+F was pressed immediately after returning through the tab strip, because the tab-strip focus did not route the plugin chord to the PDF tab. Severity: 3/10

Existing Risk: 3/10 - A reviewer may conclude that PDF find cannot reopen after a tab switch or get inconsistent results depending on focus.

Proposal Risk: 1/10 - Focusing a PDF toolbar control before Cmd+F makes the chord route reproducible, with low risk of confusion from other focus paths.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "Clarify PDF focus in the tab-switch find check". Step G3 (generated Step 6) read: "Switching away from the PDF tab closes the overlay; returning and pressing `Cmd+F` opens a fresh, empty one." It opened `find-test.pdf`, pressed `Cmd+F`, entered `needle`, switched to the `janus` tab, returned to the PDF tab, and pressed `Cmd+F`; the expected result was an empty find input. The overlay closed on the switch, but Cmd+F from the focused tab-strip button did not reopen it. Clicking the PDF tab's Zoom in button before pressing Cmd+F reopened the empty overlay. The cause is `chordTabLabel` in `web/src/useWindowKeys.ts`: a tab-strip button has no enclosing `data-tab-label`, so `registry.run` in `web/src/plugins/PluginChords.tsx` receives no PDF label; focusing Zoom in places the event target inside the PDF tab and its claim can run. Correct the How to verify step to: "Open a PDF, press Cmd+F, type a non-empty query, switch to another tab and confirm the overlay closes, then return to the PDF tab, click its Zoom in control, press Cmd+F, and confirm the overlay opens with an empty query."
