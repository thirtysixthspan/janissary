import type React from 'react';
import { useRef } from 'react';
import { keyboardCaptured, type OverlayOpenState } from './pickers/overlay-registry';

// Live snapshot refs read by useCmdW's window keydown handler, so it never has to re-register.
// `quitConfirmOpenRef` covers both the plain quit dialog and the whole quit walk, including the
// moments between steps when no walk dialog is mounted. `keyboardCapturedRef` is the common answer
// for window shortcuts, including core overlays, contributed overlays, and dialogs.
export function useCmdWRefs(
  activeTab: number,
  quitConfirmOpen: boolean,
  saveWalkOpenRef: React.RefObject<boolean>,
  overlays: OverlayOpenState,
) {
  const overlaysRef = useRef(overlays); overlaysRef.current = overlays;
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const quitConfirmOpenMirror = useRef(quitConfirmOpen); quitConfirmOpenMirror.current = quitConfirmOpen;
  const saveWalkOpenMirror = useRef(saveWalkOpenRef); saveWalkOpenMirror.current = saveWalkOpenRef;
  const quitConfirmOpenRef = useRef({
    get current(): boolean { return quitConfirmOpenMirror.current || saveWalkOpenMirror.current.current; },
  }).current;
  const keyboardCapturedRef = useRef({
    get current(): boolean { return keyboardCaptured(overlaysRef.current); },
  }).current;
  return { activeTabRef, quitConfirmOpenRef, keyboardCapturedRef };
}
