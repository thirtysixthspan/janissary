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
// (the active tab's identity) it re-arms the auto-show: shown immediately, then faded and hidden
// after AUTO_SHOW_MS unless the pointer is over the button or window. Hovering during the auto-show
// cancels the fade and hands control back to plain hover behavior; clicking pins the window open
// regardless of hover/auto-show state.
function useSingleStatusWindow(activeKey: string): StatusWindowHandlers {
  const [state, setState] = useState<WindowState>(initialWindowState);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearTimers = () => {
    clearTimeout(fadeTimer.current);
    clearTimeout(hideTimer.current);
  };

  useEffect(() => {
    clearTimers();
    setState({ pinned: false, hovered: false, autoPhase: 'showing' });
    fadeTimer.current = setTimeout(() => {
      setState((prev) => (prev.hovered || prev.pinned ? prev : { ...prev, autoPhase: 'fading' }));
      hideTimer.current = setTimeout(() => {
        setState((prev) => (prev.hovered || prev.pinned ? prev : { ...prev, autoPhase: 'none' }));
      }, FADE_OUT_MS);
    }, AUTO_SHOW_MS);
    return clearTimers;
  }, [activeKey]);

  const enter = () => {
    clearTimers();
    setState((prev) => ({ ...prev, hovered: true, autoPhase: 'none' }));
  };
  const leave = () => setState((prev) => ({ ...prev, hovered: false }));
  const click = () => {
    clearTimers();
    setState((prev) => ({ ...prev, pinned: !prev.pinned, hovered: prev.hovered, autoPhase: 'none' }));
  };

  return {
    visible: state.pinned || state.hovered || state.autoPhase !== 'none',
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
// label) so a tab becoming active re-arms the auto-show for each window.
//
// No "does this window have anything in it" argument: the panel that renders the rows already refuses
// to draw an empty one, so passing the same test here was the same fact stated twice — and it made
// this hook unusable by a plugin holding rows rather than a whole `TabView`.
export function useStatusWindows(activeKey: string) {
  return {
    connections: useSingleStatusWindow(activeKey),
    schedule: useSingleStatusWindow(activeKey),
  };
}
