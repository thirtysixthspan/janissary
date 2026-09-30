# Browser flag returns to plain after the browser exits

Issue: when a harness is using an e2e browser and the browser exits, the browser icon in the metadatabar should return to normal, not disappear.

Complexity rating: 2/10

## Goal

A `-b` harness tab's metadata row shows a plain globe from launch, which turns green ("E2E browser in use") while a browser runs behind the tab's endpoint. Today, when that browser is reported gone, the globe disappears entirely until a later connect starts a fresh one. The tab is still a `-b` tab and its endpoint still accepts a fresh connect, so the flag should fall back to its plain look ("E2E browser") instead of vanishing.

## Approach

`browserFlag` in `src/tab/view.ts` drops the flag when `tab.harness.browserError` is set and no browser is running. Remove that branch: a `-b` tab reports `browserInUse` while a browser runs and `browser` otherwise, whether or not an earlier browser died. The gone-browser band and the notification line keep the death on record, unchanged.

## Implementation steps

1. In `src/tab/view.ts`, change `browserFlag` to return `['browser']` whenever the tab was launched with `-b` and no browser is running, and update its comment to say a gone browser leaves the plain flag.
2. Update `src/tab/view.test.ts`: the "drops 'browser' from flags once the harness reports a browser gone" test and the "drops it again when that browser is reported gone" test now expect the plain `browser` flag.

## Tests

- A `-b` tab whose harness reports a gone browser (never started, `browserError` set) still carries `browser`.
- A `-b` tab whose running browser is reported gone reports `['browser']` (not `browserInUse`, not empty).
- Existing tests unchanged: `browserInUse` while running, `browserInUse` for a fresh browser after a death, ordering, and no flag for a tab not launched with `-b`.

## Out of scope

- The gone-browser band, notification line, and any other reporting of a browser death.
- Client rendering of flags (`web/src/shared/tab/flag-display.ts`, `AgentTabMeta`) — the client renders whatever identifiers the server sends.
- Remote attach behavior for browsers already running before an attach.

## Specs and docs

- `product/specs/tabs.md` (Metadata row): a gone browser returns the flag to its plain look rather than dropping it.
- `product/specs/harness.md` (End-to-end browser): same wording change.
- `documentation/user-documentation/getting-started/tabs.md`: "It disappears when that browser is reported gone" becomes a return to the plain flag.
- `help.md`: checked; it does not describe the flag's behavior on a browser death.
