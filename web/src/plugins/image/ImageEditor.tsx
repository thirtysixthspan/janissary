import React, { useState } from 'react';
import { CropOverlay } from './CropOverlay';
import type { CropRect } from './edit-model';
import type { useImageEdit } from './useImageEdit';
import { ImageEditToolbar } from './ImageEditToolbar';

// The editing surface: a toolbar above a canvas that replays the operation list from the decoded
// source `ImageTab` keeps mounted. Geometry only — crop, rotate, and flip — and every one of them
// is native canvas work, so the editor needs no third-party dependency and no network at all.
//
// Crop is direct manipulation with live numbers rather than typed fields: choosing it arms a drag
// on the canvas, the rectangle reports the dimensions it will produce while it moves, and the
// operation is appended only when it is applied.
export function ImageEditor({ edit }: { edit: ReturnType<typeof useImageEdit> }) {
  const [cropping, setCropping] = useState(false);
  const [rect, setRect] = useState<CropRect | null>(null);

  const toggleCrop = () => {
    if (cropping) {
      setCropping(false);
      setRect(null);
      return;
    }
    setCropping(true);
    if (edit.dimensions) {
      setRect({ x: 0, y: 0, width: edit.dimensions.width, height: edit.dimensions.height });
    }
  };

  const commitCrop = () => {
    if (!rect) return;
    edit.apply({ kind: 'crop', rect });
    setCropping(false);
    setRect(null);
  };

  return (
    <>
      <ImageEditToolbar
        cropping={cropping}
        canCommit={rect !== null}
        model={edit.model}
        onCrop={toggleCrop}
        onCommit={commitCrop}
        onCancel={() => { setCropping(false); setRect(null); }}
        onApply={edit.apply}
        onUndo={edit.undo}
        onRedo={edit.redo}
      />
      <div className="plugin-stage image-edit-stage">
        <div className="image-edit-surface">
          <canvas className="image-edit-canvas" ref={edit.canvasRef} tabIndex={-1} />
          {cropping && edit.dimensions && (
            <CropOverlay size={edit.dimensions} rect={rect} onChange={setRect} />
          )}
        </div>
      </div>
    </>
  );
}
