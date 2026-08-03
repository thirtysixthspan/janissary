export const PAN_STEP = 30;
export const ZOOM_STEP = 0.1;

export function onImageKey(
  e: KeyboardEvent,
  stage: HTMLDivElement | null,
  setZoom: (setter: (z: number) => number) => void,
): void {
  switch (e.key) {
  case 'ArrowUp': { e.preventDefault(); if (stage) stage.scrollTop -= PAN_STEP; break; }
  case 'ArrowDown': { e.preventDefault(); if (stage) stage.scrollTop += PAN_STEP; break; }
  case 'ArrowLeft': { e.preventDefault(); if (stage) stage.scrollLeft -= PAN_STEP; break; }
  case 'ArrowRight': { e.preventDefault(); if (stage) stage.scrollLeft += PAN_STEP; break; }
  case 'PageUp': { e.preventDefault(); setZoom(z => Math.min(8, Math.round((z + ZOOM_STEP) * 10) / 10)); break; }
  case 'PageDown': { e.preventDefault(); setZoom(z => Math.max(0.1, Math.round((z - ZOOM_STEP) * 10) / 10)); break; }
  case 'Escape': { e.preventDefault(); setZoom(() => 1); if (stage) { stage.scrollTop = 0; stage.scrollLeft = 0; } break; }
  }
}
