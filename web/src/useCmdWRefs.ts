import { useRef } from 'react';
import { keyboardCaptured, type OverlayOpenState } from './pickers/overlay-registry';

// Live snapshot refs read by useCmdW's window keydown handler, so it never has to re-register.
// `keyboardCapturedRef` is the common answer for window shortcuts, including core overlays,
// contributed overlays, and dialogs.
export function useCmdWRefs(
  activeTab: number,
  quitConfirmOpen: boolean,
  unsavedQuitOpen: boolean,
  overlays: OverlayOpenState,
) {
  const overlaysRef = useRef(overlays); overlaysRef.current = overlays;
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const quitConfirmOpenRef = useRef(quitConfirmOpen); quitConfirmOpenRef.current = quitConfirmOpen || unsavedQuitOpen;
  const keyboardCapturedRef = useRef({
    get current(): boolean { return keyboardCaptured(overlaysRef.current); },
  }).current;
  return { activeTabRef, quitConfirmOpenRef, keyboardCapturedRef };
}
