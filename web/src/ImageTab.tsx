import React, { useEffect, useRef, useState } from 'react';
import type { ImageView } from '@shared/protocol';

const PAN_STEP = 30;
const ZOOM_STEP = 0.1;

// An image view tab body: a compact metadata header (name, size, location) above the image, which
// fills the remaining space. Orientation is intrinsic to the image and read once it loads: a
// landscape image (wider than tall) spans the full width; a portrait image fills the full remaining
// height beneath the header. CSS keeps either fit responsive to tab resizes.
export function ImageTab({ image }: { image: ImageView }) {
  const [orientation, setOrientation] = useState<'image-landscape' | 'image-portrait'>('image-landscape');
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const source = `${image.url}?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const stage = stageRef.current;
      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault();
          if (stage) stage.scrollTop -= PAN_STEP;
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          if (stage) stage.scrollTop += PAN_STEP;
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (stage) stage.scrollLeft -= PAN_STEP;
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (stage) stage.scrollLeft += PAN_STEP;
          break;
        }
        case 'PageUp': {
          e.preventDefault();
          setZoom(z => Math.min(8, Math.round((z + ZOOM_STEP) * 10) / 10));
          break;
        }
        case 'PageDown': {
          e.preventDefault();
          setZoom(z => Math.max(0.1, Math.round((z - ZOOM_STEP) * 10) / 10));
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setZoom(1);
          if (stage) { stage.scrollTop = 0; stage.scrollLeft = 0; }
          break;
        }
        // No default
      }
    };
    globalThis.addEventListener('keydown', onKey);

    const stage = stageRef.current;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom(z => Math.min(8, Math.max(0.1, Math.round((z + delta) * 10) / 10)));
    };
    stage?.addEventListener('wheel', onWheel, { passive: false });

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !stage) return;
      e.preventDefault();
      dragStart.current = { x: e.clientX, y: e.clientY, scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop };
      stage.style.cursor = 'grabbing';
    };
    stage?.addEventListener('mousedown', onMouseDown);

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragStart.current;
      if (!drag || !stage) return;
      stage.scrollLeft = drag.scrollLeft - (e.clientX - drag.x);
      stage.scrollTop = drag.scrollTop - (e.clientY - drag.y);
    };
    const onMouseUp = () => {
      if (!dragStart.current) return;
      dragStart.current = null;
      if (stageRef.current) stageRef.current.style.cursor = '';
    };
    globalThis.addEventListener('mousemove', onMouseMove);
    globalThis.addEventListener('mouseup', onMouseUp);

    return () => {
      globalThis.removeEventListener('keydown', onKey);
      stage?.removeEventListener('wheel', onWheel);
      stage?.removeEventListener('mousedown', onMouseDown);
      globalThis.removeEventListener('mousemove', onMouseMove);
      globalThis.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const imgStyle: React.CSSProperties =
    orientation === 'image-landscape'
      ? { width: `${zoom * 100}%`, height: 'auto' }
      : { height: `${zoom * 100}%`, width: 'auto' };

  return (
    <div className="image-tab">
      <div className="image-meta">
        <span className="image-name">{image.name}</span>
        <span className="image-size">{image.size}</span>
        <span className="image-loc">{image.path}</span>
      </div>
      <div className="image-stage" ref={stageRef}>
        {zoom !== 1 && (
          <div className="image-zoom-badge">{Math.round(zoom * 100)}%</div>
        )}
        <img
          className={orientation}
          src={source}
          alt={image.name}
          style={imgStyle}
          onLoad={(e) => {
            const img = e.currentTarget;
            setOrientation(img.naturalWidth > img.naturalHeight ? 'image-landscape' : 'image-portrait');
          }}
        />
      </div>
    </div>
  );
}
