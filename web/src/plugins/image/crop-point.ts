import type { Size } from './edit-model';

type Bounds = { left: number; top: number; width: number; height: number };

export function imagePoint(bounds: Bounds, clientX: number, clientY: number, size: Size) {
  // A surface with no measured width is one no browser has laid out yet; treat it as 1:1 rather
  // than dividing by zero and producing a rectangle of infinities.
  const scaleX = bounds.width > 0 ? size.width / bounds.width : 1;
  const scaleY = bounds.height > 0 ? size.height / bounds.height : 1;
  return { x: (clientX - bounds.left) * scaleX, y: (clientY - bounds.top) * scaleY };
}

export function percent(value: number, extent: number): string {
  return `${(value / extent) * 100}%`;
}
