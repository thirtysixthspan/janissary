import React from 'react';
import { canRedo, type EditModel, type ImageOperation } from './edit-model';

// The five geometry controls, plus the undo pair and the confirm/cancel a crop gesture needs.
// Rotate and flip apply immediately; crop arms a drag on the canvas and is applied by the confirm
// button, so the user can adjust the rectangle before committing to it.
export function ImageEditToolbar({
  cropping, canCommit, model, onCrop, onCommit, onCancel, onApply, onUndo, onRedo,
}: {
  cropping: boolean;
  canCommit: boolean;
  model: EditModel;
  onCrop: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onApply: (operation: ImageOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="image-edit-toolbar">
      <button
        type="button" className={cropping ? 'active' : undefined}
        onClick={onCrop}
      >Crop</button>
      <button type="button" onClick={() => onApply({ kind: 'rotate', direction: 'left' })}>Rotate left</button>
      <button type="button" onClick={() => onApply({ kind: 'rotate', direction: 'right' })}>Rotate right</button>
      <button type="button" onClick={() => onApply({ kind: 'flip', axis: 'horizontal' })}>Flip horizontal</button>
      <button type="button" onClick={() => onApply({ kind: 'flip', axis: 'vertical' })}>Flip vertical</button>
      {cropping && (
        <span className="image-edit-gesture-actions">
          <button type="button" disabled={!canCommit} onClick={onCommit}>Apply crop</button>
          <button type="button" onClick={onCancel}>Cancel crop</button>
        </span>
      )}
      <span className="image-edit-history">
        <button type="button" disabled={model.cursor === 0} onClick={onUndo}>Undo</button>
        <button type="button" disabled={!canRedo(model)} onClick={onRedo}>Redo</button>
      </span>
    </div>
  );
}
