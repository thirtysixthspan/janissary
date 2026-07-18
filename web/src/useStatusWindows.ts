import { useEffect, useRef, useState } from 'react';

const AUTO_SHOW_MS = 5000;
const FADE_OUT_MS = 300;

type AutoPhase = 'none' | 'showing' | 'fading';

type WindowState = { pinned: boolean; hovered: boolean; autoPhase: AutoPhase };

const initialWindowState: WindowState = { pinned: false, hovered: false, autoPhase: 'none' };

export type StatusWindowHandlers = {
  visible: boolean;
  opacity: number;
  onButtonEnter: () => void;
  onButtonLeave: () => void;
  onButtonClick: () => void;
  onWindowEnter: () => void;
  onWindowLeave: () => void;
};

// Owns one window's pinned/hovered flags and its auto-fade timer. On every change of `activeKey`
// (the active tab's identity) it re-arms the auto-show for a non-empty window: shown immediately,
// then faded and hidden after AUTO_SHOW_MS unless the pointer is over the button or window.
// Hovering during the auto-show cancels the fade and hands control back to plain hover behavior;
// clicking pins the window open regardless of hover/auto-show state.
function useSingleStatusWindow(hasContent: boolean, activeKey: string): StatusWindowHandlers {
  const [state, setState] = useState<WindowState>(initialWindowState);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearTimers = () => {
    clearTimeout(fadeTimer.current);
    clearTimeout(hideTimer.current);
  };

  useEffect(() => {
    clearTimers();
    if (!hasContent) {
      setState(initialWindowState);
      return;
    }
    setState({ pinned: false, hovered: false, autoPhase: 'showing' });
    fadeTimer.current = setTimeout(() => {
      setState((prev) => (prev.hovered || prev.pinned ? prev : { ...prev, autoPhase: 'fading' }));
      hideTimer.current = setTimeout(() => {
        setState((prev) => (prev.hovered || prev.pinned ? prev : { ...prev, autoPhase: 'none' }));
      }, FADE_OUT_MS);
    }, AUTO_SHOW_MS);
    return clearTimers;
  }, [activeKey, hasContent]);

  const enter = () => {
    if (!hasContent) return;
    clearTimers();
    setState((prev) => ({ ...prev, hovered: true, autoPhase: 'none' }));
  };
  const leave = () => setState((prev) => ({ ...prev, hovered: false }));
  const click = () => {
    if (!hasContent) return;
    clearTimers();
    setState((prev) => ({ pinned: !prev.pinned, hovered: prev.hovered, autoPhase: 'none' }));
  };

  return {
    visible: hasContent && (state.pinned || state.hovered || state.autoPhase !== 'none'),
    opacity: state.autoPhase === 'fading' ? 0 : 1,
    onButtonEnter: enter,
    onButtonLeave: leave,
    onButtonClick: click,
    onWindowEnter: enter,
    onWindowLeave: leave,
  };
}

// Per-tab visibility/timer state for the connections and schedule windows, shared by the meta bar
// (buttons) and the panels (windows) for a given tab. `activeKey` is a stable identity (the tab's
// label) so a tab becoming active re-arms the auto-show for each of its non-empty windows.
export function useStatusWindows(activeKey: string, hasConnections: boolean, hasSchedule: boolean) {
  return {
    connections: useSingleStatusWindow(hasConnections, activeKey),
    schedule: useSingleStatusWindow(hasSchedule, activeKey),
  };
}
