# The detach control: fa link icon, green/red, disconnect/reconnect labels, metadata-row alignment

## Complexity

4/10 — two controls (the sessions rows and the remote tab's one metadata-row control), their stylesheets, and their tests.

## Goal

The entry: "the detach icon should use the font awesome link icon. When connected it should be green and when disconnected it should be red. in the green state the tool tip should say disconnect. in the red state the tool tip should say reconnect. in the metadatarow row of an agent or harness the detach icon should be light on dark and be right aligned with the other buttons in the row."

## Approach

- `SessionRowActions.tsx`: detach presents the fa link icon labelled `Disconnect`; reattach presents the same link icon labelled `Reconnect`. Each button carries `data-action` so the stylesheet colors it: detach green (`--success`), reattach red (`--error`), with `:hover` keeping its color.
- `RemoteSessionButton.tsx` (the metadata-row control): the same presentation — fa link icon, `Disconnect` while healthy, `Reconnect` while reconnecting. The confirm dialog's copy and confirm label are untouched.
- `AgentTabMeta.tsx`: move the control into the `.tab-meta-actions` group so it right-aligns with the row's other buttons.
- `theme.css`: give `.tab-remote-session` the host icon-button treatment (muted, light-on-dark, `--fg` on hover) like `.tab-open-files` and friends.
- `sessions.css`: green/red rules for the row buttons, placed before the `:disabled` rule so a disabled control stays faint.

## Tests

- `SessionList.test.tsx`: relabel `Detach claude` → `Disconnect claude` and `Reattach claude` → `Reconnect claude` across the verbs, provisioning, in-flight, and confirmation tests.
- `AgentTabMeta.test.tsx`: relabel `Detach session on devbox` → `Disconnect session on devbox` and `Reattach session on devbox` → `Reconnect session on devbox`; replace "sits beside the host chip" with a test that the control renders inside the right-aligned actions group while the chip leads.
- `sessions-style.test.ts`: the sessions stylesheet colors detach green and reattach red.

## Spec

- `product/specs/sessions-tab.md`: the row buttons present as Disconnect/Reconnect; the metadata-row control sits right-aligned among the row's other controls.

## Out of scope

- Other backlog entries; the confirm dialog copy; the server-side verbs.
