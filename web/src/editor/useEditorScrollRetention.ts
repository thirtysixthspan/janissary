// Keeps an editor tab's vertical scroll position across tab switches. Every editor tab stays
// mounted and the inactive ones are hidden with `display: none` (see MountedViewLayers), which is
// what lets the buffer, undo stack, and cursor survive — they live in React state. The scroll
// offset does not: a box the browser is not generating has no scroll position, so it is dropped the
// moment the tab is hidden and the body comes back at the top of the file.
//
// So the offset is mirrored outside the DOM. Every scroll while the tab is on screen records it,
// and it is written back in a layout effect the frame the tab becomes visible again — before the
// browser paints, so the reader never sees the top of the document flash past.

import { useLayoutEffect, useRef } from 'react';

export function useEditorScrollRetention(
  bodyRef: React.RefObject<HTMLElement | null>,
  visible: boolean,
): () => void {
  const offsetRef = useRef(0);

  useLayoutEffect(() => {
    if (!visible) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = offsetRef.current;
  }, [visible, bodyRef]);

  // A scroll event that arrives while the tab is hidden can only report zero — recording it would
  // throw away the very offset that is waiting to be restored.
  return () => {
    const body = bodyRef.current;
    if (visible && body) offsetRef.current = body.scrollTop;
  };
}
