import { useRef } from 'react';
import type { RouteChooserView } from '@shared/protocol';
import { firstOpenOverlay, type OverlayOpenState } from './pickers/overlay-registry';

// Live snapshot refs read by useCmdW's window keydown handler, so it never has to re-register.
// `pickerOpenRef` asks the overlay registry the same question the render chain and the keyboard
// priority chain ask, rather than ORing a hand-picked subset of the overlays.
export function useCmdWRefs(
  activeTab: number,
  quitConfirmOpen: boolean,
  unsavedQuitOpen: boolean,
  overlays: OverlayOpenState,
  route: RouteChooserView | null,
) {
  const anyOverlayOpen = firstOpenOverlay(overlays) !== undefined;
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const quitConfirmOpenRef = useRef(quitConfirmOpen); quitConfirmOpenRef.current = quitConfirmOpen || unsavedQuitOpen;
  const pickerOpenRef = useRef(anyOverlayOpen); pickerOpenRef.current = anyOverlayOpen;
  const routeRef = useRef(route); routeRef.current = route;
  return { activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef };
}
