# Clear Toasts When the Notifications Feed Becomes Visible

**Complexity: 3/10** — the toast queue already owns all toast timers, and the application shell already derives feed visibility from the active center view and each selected sidebar body.

## Goal

Remove pending toasts when the user's client starts showing the notifications feed, including toasts held by hover or focus.

## Approach

Clear the client-owned toast queue on a transition from hidden to visible. Keep incoming toasts suppressed while visible, and retain queued toasts when the feed exists but remains hidden in the center or behind another docked view.

## Implementation steps

1. Clear the toast queue on a client-local transition to a visible notifications body.
2. Verify a held toast and its timers are removed, while hidden docked feeds still display incoming toasts.
3. Verify selecting notifications in the application shell clears the corner stack.

## Tests

- A hover-held toast disappears and its timers are cancelled when the feed becomes visible.
- A toast remains visible while files are selected over a docked notifications feed.
- Selecting the feed clears that pending toast.
- Existing click reveal and burst-clear behavior remains covered.

## Out of scope

- Clearing the notification queue or record when the feed becomes visible.
- Clearing a toast while the notifications body remains hidden.
