import { useEffect } from 'react';
import type { JanusClient } from './ws';
import type { RouteChooserView } from '@shared/protocol';
import { handleRouteChooserKey, handlePickerKey } from './keyboard-handlers';

type StateSnapshot = {
  pickerOpen: boolean;
  pickerIdx: number;
  recent: string[];
  route: RouteChooserView | null;
  routeIdx: number;
};

type Callbacks = {
  setRouteIndex: (setter: (prev: number) => number) => void;
  chooseRoute: (index: number) => void;
  runCommand: (text: string) => void;
  setPickerIndex: (setter: (prev: number) => number) => void;
  setPickerOpen: (open: boolean) => void;
  openPicker: () => void;
};

export function useWindowKeys(
  client: JanusClient,
  stateRef: React.RefObject<StateSnapshot>,
  callbacksRef: React.RefObject<Callbacks>,
  handleScrollKey: (e: KeyboardEvent) => boolean,
  handleScrollKeyUp: (e: KeyboardEvent) => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const snap = stateRef.current;
      const cb = callbacksRef.current;
      if (!snap || !cb) return;
      if (snap.route) {
        handleRouteChooserKey(e, snap.route, snap.routeIdx, cb.setRouteIndex, cb.chooseRoute);
        return;
      }
      if (snap.pickerOpen) {
        handlePickerKey(e, snap.recent, snap.pickerIdx, cb.setPickerIndex, cb.runCommand, cb.setPickerOpen);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); cb.openPicker(); return; }

      if (handleScrollKey(e)) return;
      if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
      else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
      else if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
    };
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener('keyup', handleScrollKeyUp);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('keyup', handleScrollKeyUp);
    };
  }, [client, stateRef, callbacksRef, handleScrollKey, handleScrollKeyUp]);
}
