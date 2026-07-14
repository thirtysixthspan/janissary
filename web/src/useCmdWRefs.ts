import { useRef } from 'react';
import type { RouteChooserView, TabView } from '@shared/protocol';

// Live snapshot refs read by useCmdW's window keydown handler, so it never has to re-register.
export function useCmdWRefs(
  activeTab: number,
  quitConfirmOpen: boolean,
  unsavedQuitOpen: boolean,
  pickerOpen: boolean,
  queueOpen: boolean,
  taskPickerOpen: boolean,
  profilePickerOpen: boolean,
  route: RouteChooserView | null,
  currentView: TabView['view'] | undefined,
) {
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const quitConfirmOpenRef = useRef(quitConfirmOpen); quitConfirmOpenRef.current = quitConfirmOpen || unsavedQuitOpen;
  const pickerOpenRef = useRef(pickerOpen); pickerOpenRef.current = pickerOpen || queueOpen || taskPickerOpen || profilePickerOpen;
  const routeRef = useRef(route); routeRef.current = route;
  const activeViewRef = useRef(currentView); activeViewRef.current = currentView;
  return { activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef };
}
