# Shorten the remote-session detach notice

**Complexity: 2/10** — one server-side notification literal, a focused manager test, and a matching sessions specification update.

## Goal

Make successful detach notifications concise by removing the redundant instruction to attach from the sessions tab.

## Approach

The detach action constructs the successful notification in `src/sessions/actions.ts`. Replace only its event suffix and add a manager-level assertion through the existing session fixture.

## Implementation steps

1. Change the successful detach notification suffix to `detached.`.
2. Add a session-manager test for the resulting notification text.

## Tests

- `src/sessions/manager.test.ts` — checks the successful detach notification.

## Spec updates

- `product/specs/sessions-tab.md` — update the notification wording.

## Docs

- Checked `help.md` and `documentation/user-documentation/`; neither quotes this notification, so no update is needed.

## Out of scope

- Detach behavior and every other notification message.
