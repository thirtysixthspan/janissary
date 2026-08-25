import React, { useRef, useState } from 'react';
import {
  clampCrop, nudgeRect, rectFromDrag,
  type CropHandle, type CropRect, type Size,
} from './edit-model';

const HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

// A crop rectangle over the canvas, in image pixels. The user drags it out anywhere and nudges it
// by its edges and corners. The live readout tells them the dimensions they will get.
function toImagePoint(host: HTMLElement, event: React.PointerEvent, size: Size) {
  const bounds = host.getBoundingClientRect();
  // A surface with no measured width is one no browser has laid out yet; treat it as 1:1 rather
  // than dividing by zero and producing a rectangle of infinities.
  const scaleX = bounds.width > 0 ? size.width / bounds.width : 1;
  const scaleY = bounds.height > 0 ? size.height / bounds.height : 1;
  return { x: (event.clientX - bounds.left) * scaleX, y: (event.clientY - bounds.top) * scaleY };
}

function percent(value: number, extent: number): string {
  return `${(value / extent) * 100}%`;
}

export function CropOverlay({
  size, rect, onChange,
}: {
  size: Size;
  rect: CropRect | null;
  onChange: (rect: CropRect) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ origin: { x: number; y: number }; handle: CropHandle | null } | null>(null);

  const begin = (event: React.PointerEvent, handle: CropHandle | null) => {
    const host = hostRef.current;
    if (!host || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = toImagePoint(host, event, size);
    if (handle === null) {
      setDrag({ origin: point, handle: null });
      onChange(clampCrop(rectFromDrag(point, point), size));
    } else {
      setDrag({ origin: point, handle });
    }
  };

  const move = (event: React.PointerEvent) => {
    const host = hostRef.current;
    if (!drag || !host) return;
    const point = toImagePoint(host, event, size);
    const next = drag.handle === null
      ? rectFromDrag(drag.origin, point)
      : nudgeRect(rect ?? { x: 0, y: 0, width: 0, height: 0 }, drag.handle, point);
    onChange(clampCrop(next, size));
  };

  const end = () => { setDrag(null); };

  return (
    <div
      ref={hostRef}
      className="image-crop-overlay"
      data-testid="crop-overlay"
      onPointerDown={(event) => begin(event, null)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
    >
      {rect && (
        <div
          className="image-crop-rect"
          style={{
            left: percent(rect.x, size.width),
            top: percent(rect.y, size.height),
            width: percent(rect.width, size.width),
            height: percent(rect.height, size.height),
          }}
        >
          {HANDLES.map((handle) => (
            <span
              key={handle}
              className={`image-crop-handle image-crop-handle-${handle}`}
              data-testid={`crop-handle-${handle}`}
              onPointerDown={(event) => begin(event, handle)}
            />
          ))}
          <span className="image-crop-readout">{rect.width} × {rect.height}</span>
        </div>
      )}
    </div>
  );
}
