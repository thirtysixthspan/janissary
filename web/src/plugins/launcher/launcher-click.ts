// Click-confirmation rules for the launcher's two row lists, kept pure so the "which click opens this
// row" decision is testable without a render — the same seam the sessions, conversations, and hosts
// lists keep in their *-keys modules.

// A click highlights and confirms in one step; the row opens on the second click of an already
// highlighted one. One rule for every list here, because "click twice to run" is what a terminal user's
// muscle memory expects and a rail that ran on every click would fire while the user is still reading.
export function commandClickSelection(
  index: number,
  confirmed: number | null,
): { selected: number; opens: boolean } {
  return { selected: index, opens: confirmed === index };
}

// A tab row is navigation rather than a command, so an inactive row focuses on one click — the way
// clicking the tab in the strip does. The host's active fact is authoritative; a remembered position
// may now hold another row after a tier reorder, or be inactive after focus moved elsewhere.
export function tabClickSelection(
  index: number,
  active: boolean,
): { selected: number; opens: boolean } {
  return { selected: index, opens: !active };
}
