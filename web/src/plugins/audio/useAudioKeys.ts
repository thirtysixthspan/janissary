import { useEffect, type RefObject } from 'react';

// One seek step, in seconds. The single place it is expressed: the arrow keys and the two seek
// buttons both come through `audioTransport`, so a key and its button can never drift apart.
export const SEEK_STEP_SECONDS = 10;

// The five transport actions, over whatever player element is mounted. The element is read through
// its ref at call time rather than captured, so an action bound during the first render still finds
// the player that mounted after it. Seeking clamps at both ends of the current track rather than
// spilling into the neighbouring one — moving between tracks is what Shift+arrow and the
// previous/next buttons are for.
export function audioTransport(playerRef: RefObject<HTMLAudioElement | null>, actions: {
  previous: () => void;
  next: () => void;
}) {
  const seek = (delta: number) => {
    const player = playerRef.current;
    if (!player) return;
    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    player.currentTime = Math.min(Math.max(0, player.currentTime + delta), duration);
  };
  return {
    toggle: () => {
      const player = playerRef.current;
      if (!player) return;
      if (player.paused) {
        const started: Promise<void> | undefined = player.play();
        void started?.catch(() => {});
      } else player.pause();
    },
    seekBackward: () => { seek(-SEEK_STEP_SECONDS); },
    seekForward: () => { seek(SEEK_STEP_SECONDS); },
    previous: actions.previous,
    next: actions.next,
  };
}

export type AudioTransport = ReturnType<typeof audioTransport>;

// Space, arrows, and Shift+arrows, bound at the window while this tab is the visible one. A plugin
// tab stays mounted while hidden, so the binding consults the host's own `active` answer rather than
// reading visibility off the DOM — a hidden audio tab must not swallow the arrow keys.
export function useAudioKeys(active: boolean, transport: AudioTransport): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); transport.toggle(); return; }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) transport.previous();
        else transport.seekBackward();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) transport.next();
        else transport.seekForward();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, [active, transport]);
}
