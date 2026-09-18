# Connection indicator moves to the stylesheet and out of the column's flow

Issue: the connection indicator is inline-styled and shifts the center column when it appears.

Complexity rating: 2/10

## Goal

`ConnectionStatusLabel` hardcodes its font size, padding, and colour in an inline `style` object, so its appearance sits outside `web/src/theme.css` — the one place every comparable piece of muted chrome in this app is defined and the one place the themes are defined. And `AppShell` renders it as an ordinary first child of `.app-center`, a `flex-direction: column` container, so the element takes flow space and pushes the active tab's body down the moment the socket drops. For a harness or ssh tab that reflows the terminal at exactly the moment its output cannot be redelivered.

Give the indicator a class in the stylesheet and overlay it instead of placing it in the flow.

## Approach

Add a `.connection-status` rule to `web/src/theme.css` carrying what the inline object carried — `color: var(--muted)` and the 12px size its neighbours (`.panel`, `.panel-row-close`) use rather than the `0.85em` the inline style used — plus the positioning. `.app-center` already carries `position: relative`, so `position: absolute` in its top-right corner is the whole of the layout change and removes the resize outright.

Top-right of the centre column is the tab strip's right end, which is empty in the ordinary case: the tabs pack from the left. It is also clear of the floating status panels, which are positioned inside `.main` and therefore a tab-strip's height lower down. The indicator takes a `background: var(--bg-soft)` and a radius so it stays legible in the case where wrapped tabs do reach that far, `pointer-events: none` so it can never intercept a click meant for a tab, and a z-index above the status panels and below the modal layer.

The component then renders `className="connection-status"` in place of the `style` object, keeping `role="status"` and the null return for the connected phase exactly as they are.

## Implementation steps

1. Add the `.connection-status` rule to `web/src/theme.css`, beside the floating status-panel chrome it is a sibling of, with a comment saying why the indicator is overlaid rather than placed in the flow.
2. Replace the inline `style` object in `web/src/ConnectionStatusLabel.tsx` with `className="connection-status"`.

## Tests

- `web/src/ConnectionStatusLabel.test.tsx`: extend the existing case so the rendered element carries the `connection-status` class and no inline `style` attribute — the assertion that the appearance lives in the stylesheet rather than in the component.
- `web/src/App.test.tsx`'s `shows reconnection in the shell around a %s view` case drives `AppShell` for all five views and must keep passing unchanged.

No test asserts the centre column's height, and none is added: the positioning is verified by hand against a harness terminal, confirming it does not reflow as the label appears and disappears.

## Out of scope

- The wording, the phases, and the timing — `useConnectionStatus` is untouched.
- Where the indicator is mounted: it stays in `AppShell`, colocated as the plan for the feature placed it.
- Every other inline style in `web/src/`.

## Specs and docs

- `product/specs/sleep-and-resume.md`: the sentence describing the announcement says it appears in the centre column; extended to say it is overlaid in the corner and does not move the tab's content.
- `product/specs/websocket-rpc.md`: describes the wording only, and is left alone.
- `help.md` and `documentation/user-documentation/`: neither documents the indicator's placement; no update.
