import React, { useEffect, useRef, useState } from 'react';
import type { ImagePayload } from '@shared/plugins/image/shared';
import { onImageKey, ZOOM_STEP } from './image-handlers';

// The read-only half of the image tab: the zoom-and-pan stage. Extracted from `ImageTab` unchanged
// when the editor was added, so the viewer's behavior is exactly what it always was.
//
// A plugin tab stays mounted while its tab is hidden, so zoom, pan, and the keyboard listeners all
// key off `active`: only the visible image tab answers the zoom/pan keys, and becoming visible again
// returns the view to 100% with no offset.
export function ImageViewer({
  image, source, active, sourceRef, onSourceLoad,
}: {
  image: ImagePayload;
  source: string;
  active: boolean;
  sourceRef: React.Ref<HTMLImageElement>;
  onSourceLoad: (element: HTMLImageElement) => void;
}) {
  const [orientation, setOrientation] = useState<'image-landscape' | 'image-portrait'>('image-landscape');
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

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
    <div className="plugin-stage" ref={stageRef}>
      {zoom !== 1 && (
        <div className="image-zoom-badge">{Math.round(zoom * 100)}%</div>
      )}
      <img
        ref={sourceRef}
        className={orientation}
        src={source}
        alt={image.name}
        style={imgStyle}
        onLoad={(e) => {
          const img = e.currentTarget;
          onSourceLoad(img);
          setOrientation(img.naturalWidth > img.naturalHeight ? 'image-landscape' : 'image-portrait');
        }}
      />
    </div>
  );
}
