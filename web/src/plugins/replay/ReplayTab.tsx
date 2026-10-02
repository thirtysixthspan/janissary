import React, { useEffect, useMemo, useRef } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import { ReplayMeta } from './ReplayMeta';
import { TransportBar } from './TransportBar';
import { usePlayback } from './usePlayback';
import { useReplaySource } from './useReplaySource';
import { useReplayTerminal } from './useReplayTerminal';
import type { ReplayPayload } from '@shared/plugins/replay/shared';

// The replay tab: a recording's own bytes, fed into a terminal at the size they were recorded at, with
// a transport under them. Everything it knows, it knows from the file — the plugin holds no server
// state and asks the host for nothing while playing.
export function ReplayTab({
  payload, capabilities,
}: {
  payload: ReplayPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resourceUrl, active, splitAction, dock } = capabilities;
  const source = useReplaySource(resourceUrl(payload.url), active);
  const terminal = useReplayTerminal(source.header, containerRef, capabilities);
  // A recording still being written is followed and holds at the end of what has been recorded rather
  // than reporting the replay finished. Both facts are needed: the server's answer says the recording
  // was not being written when the tab opened, and new bytes arriving say it is being written now —
  // and a first read always brings bytes, so either alone would put every freshly opened recording
  // into the live state for a moment.
  const playback = usePlayback(source.events, terminal, !payload.finished && source.growing);

  useEffect(() => { if (!active) playback.pause(); }, [active, playback]);

  // Space and `p` play and pause, `,` and `.` step one recorded event, and `[` and `]` change speed.
  // Every one of them is also a button, so a chord is the short way round rather than the only way —
  // and none is claimed while the user is in a text field. Each is deliberately unshifted, so none can
  // collide with a key the terminal underneath already claims.
  //
  // `active` is read through a ref rather than listed as a dependency: the listener is installed once
  // and decides per keystroke whether the tab is on screen, which is the same gate the host's `active`
  // exists for and the same reason a mounted-but-hidden tab must not answer keys.
  const visible = useRef(active);
  visible.current = active;

  const onKey = useMemo(() => (event: KeyboardEvent) => {
    if (!visible.current || event.altKey || event.metaKey || event.ctrlKey) return false;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return false;
    switch (event.key) {
      case ' ': case 'p': { playback.toggle(); return true; }
      case ',': { playback.step(-1); return true; }
      case '.': { playback.step(1); return true; }
      case '[': { playback.cycleSpeed(-1); return true; }
      case ']': { playback.cycleSpeed(1); return true; }
      default: { return false; }
    }
  }, [playback]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (onKey(event)) event.preventDefault(); };
    globalThis.addEventListener('keydown', listener);
    return () => globalThis.removeEventListener('keydown', listener);
  }, [onKey]);

  return (
    <div className="replay-tab" data-dock={dock ?? undefined}>
      <div className="replay-head">
        <ReplayMeta
          header={source.header}
          duration={playback.duration}
          growing={source.growing}
          exitStatus={source.exitStatus}
          problem={source.error}
        />
        {splitAction}
      </div>
      <div className="replay-stage" ref={containerRef} />
      <TransportBar playback={playback} />
    </div>
  );
}
