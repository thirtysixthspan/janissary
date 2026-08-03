import React, { useEffect, useRef, useState } from 'react';
import type { ImagePayload } from '@shared/plugins/image/shared';
import type { TabPluginClientCapabilities } from '../api';
import { onImageKey, ZOOM_STEP } from './image-handlers';

// An image view tab body: a compact metadata header (name, size, location) above the image, which
// fills the remaining space. Orientation is intrinsic to the image and read once it loads: a
// landscape image (wider than tall) spans the full width; a portrait image fills the full remaining
// height beneath the header. CSS keeps either fit responsive to tab resizes.
//
// A plugin tab stays mounted while its tab is hidden, so zoom, pan, and the keyboard listeners all
// key off `capabilities.active`: only the visible image tab answers the zoom/pan keys, and becoming
// visible again returns the view to 100% with no offset.
export function ImageTab({
  payload: image, capabilities,
}: { payload: ImagePayload; capabilities: TabPluginClientCapabilities }) {
  const [orientation, setOrientation] = useState<'image-landscape' | 'image-portrait'>('image-landscape');
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const active = capabilities.active;
  const source = capabilities.resourceUrl(image.url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onImageKey(e, stageRef.current, setZoom);
    if (active) globalThis.addEventListener('keydown', onKey);

    const stage = stageRef.current;
    if (active && stage) { stage.scrollTop = 0; stage.scrollLeft = 0; }
    if (active) setZoom(1);

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
      if (active) globalThis.removeEventListener('keydown', onKey);
      stage?.removeEventListener('wheel', onWheel);
      stage?.removeEventListener('mousedown', onMouseDown);
      globalThis.removeEventListener('mousemove', onMouseMove);
      globalThis.removeEventListener('mouseup', onMouseUp);
    };
  }, [active]);

  const imgStyle: React.CSSProperties =
    orientation === 'image-landscape'
      ? { width: `${zoom * 100}%`, height: 'auto' }
      : { height: `${zoom * 100}%`, width: 'auto' };

  return (
    <div className="image-tab" data-doc-shot="image-view">
      <div className="image-meta">
        <span className="image-name">{image.name}</span>
        <span className="image-size">{image.size}</span>
        <span className="image-loc">{image.path}</span>
        {capabilities.splitAction && <span className="image-actions">{capabilities.splitAction}</span>}
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
