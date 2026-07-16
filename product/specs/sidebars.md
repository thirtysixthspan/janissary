# Sidebars

A **left sidebar** and a **right sidebar** flank the central tab area. Both are hidden by
default and appear only once something is docked into them.

### Docking

A tab can be **docked** into a sidebar instead of living in the central tab strip. Docking is a
placement, not a separate kind of tab — a docked tab keeps everything else about it (its group,
its transcript or view, its RPC identity) exactly as it was. Two tab kinds can dock: the file
navigator (see `file-tree-tab.md`) and the notifications tab (see `notifications.md`). They share
one docking mechanism and, being different kinds, can occupy the **same** sidebar at the same
time — see "Sharing a sidebar" below — as well as different sidebars.

Each sidebar holds **at most one docked tab of each kind at a time**. Docking a tab into a side
that already holds a tab of the *same* kind **displaces** that occupant, which returns to the
center tab strip — nothing is closed as a side effect of docking. Docking into a side that holds
the *other* kind does not displace it; both stay docked, sharing the sidebar.

### Sharing a sidebar

When both the file navigator and the notifications tab are docked to the same side, the sidebar's
tab strip shows one entry per docked tab, side by side — like the central tab strip — with the
visible one highlighted; clicking an entry flips to it. There is no separate switcher above the
strip. Docking a second kind into an already-occupied side brings it into view automatically. Which
of the two is currently visible is ephemeral, client-side display state, like sidebar width (see
"What's server-owned vs. client-owned" below) — it is never sent to the server and resets on
relaunch.

### Visibility is derived

A sidebar is **not** an independent on/off setting: it renders exactly when some tab is docked to
it, and disappears the moment that tab is undocked or closed. There is no way to show an empty
sidebar. A docked tab does **not** prevent the app from quitting — closing the last non-docked
tab quits the app, the same as if no sidebar existed.

### Leaving the strip

While a tab is docked, it is **not shown in the central tab strip** — there is no duplicate
representation of it there. It reappears in the strip, in its original position within its
group, the moment it is undocked.

### The active-tab invariant

A docked tab is **never the active tab**. Docking the currently active tab moves focus to the
nearest tab that isn't docked. Undocking a tab back to the center strip makes it active again —
focusing a docked tab always means bringing it fully into view, which requires undocking it.
Tab-cycling commands (e.g. switching to the next tab) skip over docked tabs, since they are not
eligible to become active.

### The sidebar strip

Each sidebar shows its own tab strip above the visible docked tab's content: one entry per docked
tab, each carrying that tab's name and its own close button (×). Each entry's × closes that entry's
tab. This is the sole close affordance for a docked tab — a docked tab is never the active tab (see
above) and so cannot be closed by typing `close`, and its own metadata header carries no close
button of its own (`close <label>` by label still works as a fallback).

The sidebar strip behaves exactly like the central tab strip: each entry's label is fixed-width,
hugging its own (length-capped) content rather than stretching to fill the strip, and double-clicking
the visible entry's label opens the same inline rename control as any other tab, committing the new
name the same way.

### Resizing

Each sidebar's width is adjusted by dragging the divider on its inner edge (the edge facing the
center content) with the mouse. Width is clamped to a minimum and to roughly half the viewport,
so a sidebar can never crowd out the center content entirely or shrink to nothing. Width is
ephemeral display state: it resets to a default on relaunch and is never persisted, independent
per sidebar, and unrelated to which tab happens to be docked there. The divider's plain-border
look matches the divider used to resize the reporting section below the tab strip.

### What's server-owned vs. client-owned

Which tab is docked where is **server-owned** state, broadcast to the client like any other tab
property — the server enforces the one-tab-per-kind-per-sidebar rule and the active-tab invariant.
Sidebar **width** and which docked tab is currently visible (when a side holds both kinds) are, by
contrast, purely client-side display chrome, the same way scroll position is: neither is ever sent
to the server or persisted.

### Persistence

Dock placement and sidebar width both reset on relaunch — neither is saved. This matches file
tree tabs generally: they are live, in-memory views, never persisted or restored (see
`file-tree-tab.md`).

### Keyboard focus

A sidebar can receive keyboard focus via section navigation (see `keyboard-navigation.md`), which
focuses its currently-visible docked tab without changing the server's active tab — reaffirming
that a docked tab is never the active tab.
