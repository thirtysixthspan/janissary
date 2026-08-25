import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen } from '@fortawesome/free-solid-svg-icons';
import type { ImagePayload } from '@shared/plugins/image/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ImageEditor } from './ImageEditor';
import { ImageViewer } from './ImageViewer';
import { useImageEdit } from './useImageEdit';

// An image tab: a compact metadata header (name, size, location) above one of two bodies. The
// viewer is the read-only zoom-and-pan stage the tab has always been; the editor is a canvas and a
// geometry toolbar. The pen-shaped **Edit image** control flips between them, and `edit photo.png`
// — from a command bar, the quick-open picker, a transcript file link, or Shift+double-click in the
// file navigator — opens the tab already flipped.
//
// Leaving edit mode never discards: the operation list stays live behind the viewer, the tab stays
// marked unsaved in the strip, and **Edit image** comes back to exactly the work in progress. The
// only place unsaved edits can be lost is closing the tab or quitting, and the host's save-changes
// dialog guards both through the dirty handle this tab registers.
export function ImageTab({
  payload: image, capabilities,
}: { payload: ImagePayload; capabilities: TabPluginClientCapabilities }) {
  const [editing, setEditing] = useState(image.mode === 'edit');
  const edit = useImageEdit(capabilities);
  const { save } = edit;
  const source = capabilities.resourceUrl(image.url);

  // The server flips an already-open viewer into edit mode by replacing the payload, so the mode
  // arrives as a re-render rather than a remount. Keyed on the path: a payload replacement for the
  // same file must never throw away edits in progress.
  useEffect(() => {
    if (image.mode === 'edit') setEditing(true);
  }, [image.mode, image.path]);

  useEffect(() => {
    if (!editing || !capabilities.active) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setEditing(false);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, [capabilities.active, editing, save]);

  return (
    <div className="image-tab" data-doc-shot="image-view">
      <div className="image-meta">
        <span className="image-name">{image.name}</span>
        <span className="image-size">{image.size}</span>
        <span className="image-loc">{image.path}</span>
        {editing && edit.dimensions && (
          <span className="image-dimensions">{edit.dimensions.width} × {edit.dimensions.height}</span>
        )}
        {edit.saved && <span className="image-edit-saved">Saved {edit.saved}</span>}
        <span className="image-actions">
          {editing ? (
            <>
              <button type="button" disabled={edit.busy || !edit.dirty} onClick={() => { void edit.save(); }}>
                Save
              </button>
              <button type="button" onClick={() => { setEditing(false); }}>Done</button>
            </>
          ) : (
            <button
              type="button"
              className="image-edit-toggle"
              title="Edit image"
              aria-label="Edit image"
              onClick={() => { setEditing(true); }}
            >
              <FontAwesomeIcon icon={faPen} />
            </button>
          )}
          {capabilities.splitAction}
        </span>
      </div>
      {editing ? (
        <>
          {/* The editor has no visible image element, so its canvas keeps one hidden pixel source. */}
          <img
            className="image-edit-source"
            ref={edit.sourceRef}
            src={source}
            alt=""
            onLoad={(event) => { edit.onSourceLoad(event.currentTarget); }}
          />
          <ImageEditor edit={edit} />
        </>
      ) : (
        // The visible viewer image is also the editor's source. Loading a second hidden copy here
        // can leave a freshly navigator-opened tab with only the hidden request decoded.
        <ImageViewer
          image={image}
          source={source}
          active={capabilities.active}
          sourceRef={edit.sourceRef}
          onSourceLoad={edit.onSourceLoad}
        />
      )}
    </div>
  );
}
