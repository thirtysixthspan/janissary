const LINE_STEP = 40;

// Keyboard scrolling for the notifications feed's transcript container: Arrow keys nudge by a line,
// Page keys by a viewport. Mirrors `onMarkdownKey`, but is attached per-element (only while the feed
// holds focus) because the notifications tab can be docked alongside a different active tab.
export function onNotificationsKey(e: KeyboardEvent, container: HTMLDivElement | null): void {
  if (!container) return;
  switch (e.key) {
  case 'ArrowUp': { e.preventDefault(); container.scrollTop -= LINE_STEP; break; }
  case 'ArrowDown': { e.preventDefault(); container.scrollTop += LINE_STEP; break; }
  case 'PageUp': { e.preventDefault(); container.scrollTop -= container.clientHeight; break; }
  case 'PageDown': { e.preventDefault(); container.scrollTop += container.clientHeight; break; }
  }
}
