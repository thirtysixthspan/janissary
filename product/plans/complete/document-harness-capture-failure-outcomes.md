# Document the new harness capture failure outcomes

Complexity 2/10 - documentation-only, one page, no code or test changes (per the entry's own
Proposal).

`documentation/user-documentation/advanced-agents/harness.md`'s "Capturing a harness's screen"
section gained a paragraph about detached-query failures but its bulleted error list still says
`No tab labeled "<name>".` applies whenever no tab has the label — true only before this PR's
persisted-record resolution existed — and names neither the ambiguous-label refusal nor the
reconnecting refusal `captureSubcommand`/`resolveOpenRemoteCapture` can now return.

## Goal

The bulleted error list in `harness.md` enumerates every outcome `captureSubcommand` and
`resolveOpenRemoteCapture` can produce, matching `product/specs/harness.md` (the source of
truth), and a session detached from the Sessions tab is documented as still capturable by its
recorded label.

## Approach

In `documentation/user-documentation/advanced-agents/harness.md`, under "Capturing a harness's
screen": amend the `No tab labeled "<name>".` bullet to say it applies when neither an open tab
nor a persisted detached session record carries the label; add two new bullets for `Multiple
detached sessions are labeled "<name>". Attach the intended session before capturing.` and `No
capture available for "<name>" — connection is reconnecting.`; and add a sentence stating a
session detached from the Sessions tab can still be captured by its recorded label, since a
deliberate Detach closes the tab and the page otherwise reads as though a capture needs one
open.

## Implementation steps

1. Edit the bulleted error list and add the one sentence.
2. Run `check-diff` (docs-only; expected to have nothing scoped to lint or test).

## Tests

None — documentation only, no code changed.

## Out of scope

- Any code or test change — `captureSubcommand`, `resolveOpenRemoteCapture`, and their tests are
  already correct; this page was only behind them.
- `product/specs/harness.md` itself, which already describes all three cases and is the source
  this page restates.
