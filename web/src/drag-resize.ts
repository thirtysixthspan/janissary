// Attaches a mouse-drag gesture to the window for the duration of a drag started by a
// `mousedown` handler: `onMove` fires on every `mousemove`, and both listeners remove
// themselves on the following `mouseup`. Shared by every draggable resize divider
// (ReportingSection's height divider, Sidebar's width divider).
export function startDrag(onMove: (e: MouseEvent) => void): void {
  const onUp = () => {
    globalThis.removeEventListener('mousemove', onMove);
    globalThis.removeEventListener('mouseup', onUp);
  };
  globalThis.addEventListener('mousemove', onMove);
  globalThis.addEventListener('mouseup', onUp);
}
