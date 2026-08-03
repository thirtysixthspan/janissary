const LINE_STEP = 40;

export function onMarkdownKey(e: KeyboardEvent, stage: HTMLDivElement | null): void {
  if (!stage) return;
  switch (e.key) {
  case 'ArrowUp': { e.preventDefault(); stage.scrollTop -= LINE_STEP; break; }
  case 'ArrowDown': { e.preventDefault(); stage.scrollTop += LINE_STEP; break; }
  case 'PageUp': { e.preventDefault(); stage.scrollTop -= stage.clientHeight; break; }
  case 'PageDown': { e.preventDefault(); stage.scrollTop += stage.clientHeight; break; }
  }
}
