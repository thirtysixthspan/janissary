import React, { useEffect, useMemo, useRef } from 'react';
import { isTextEntryElement, type TabPluginClientCapabilities } from '../api';
import { AsciicastMeta } from './AsciicastMeta';
import { TransportBar } from './TransportBar';
import { usePlayback } from './usePlayback';
import { useAsciicastSource } from './useAsciicastSource';
import { useAsciicastTerminal } from './useAsciicastTerminal';
import type { AsciicastPayload } from '@shared/plugins/asciicast/shared';

// The asciicast tab: a recording's own bytes, fed into a terminal at the size they were recorded at,
// with a transport under them. Everything it knows, it knows from the file — the plugin holds no
// server state and asks the host for nothing while playing.
export function AsciicastTab({
  payload, capabilities,
}: {
  payload: AsciicastPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resourceUrl, active, splitAction, dock } = capabilities;
  // Whether the session writing this recording is still running: the host's answer at open, and the
  // host again whenever a poll brings nothing new. A recording still being written is followed and
  // holds at the end of what has been recorded rather than reporting the playback finished, and it is
  // badged for as long as the session lasts rather than for as long as it keeps talking.
  const askLive = async (): Promise<boolean> => {
    const answer = await capabilities.intent<{ live: boolean }>('liveness', null);
    return answer.live;
  };
  const source = useAsciicastSource({
    url: resourceUrl(payload.url), active, liveAtOpen: !payload.finished, askLive,
  });
  const terminal = useAsciicastTerminal(source.header, containerRef, capabilities);
  const playback = usePlayback(source.events, terminal, source.live);

  useEffect(() => { if (!active) playback.pause(); }, [active, playback]);

  // Space and `p` play and pause, `,` and `.` step one recorded event, and `[` and `]` change speed.
  // Every one of them is also a button, so a chord is the short way round rather than the only way —
  // and none is claimed while the user is in a text field. Each is deliberately unshifted, so none can
  // collide with a key the terminal underneath already claims.
  //
  // Clicking the recording is the first thing anyone does with a player, and that hands focus to the
  // textarea xterm keeps for composition. It is the terminal's own bookkeeping, not a field someone is
  // typing into, so the chords stay live through it — which is why the test below it is the shared
  // "where can text go" predicate with that one class exempted rather than a tag-name check.
  //
  // `active` is read through a ref rather than listed as a dependency: the listener is installed once
  // and decides per keystroke whether the tab is on screen, which is the same gate the host's `active`
  // exists for and the same reason a mounted-but-hidden tab must not answer keys.
  const visible = useRef(active);
  visible.current = active;

  const onKey = useMemo(() => (event: KeyboardEvent) => {
    if (!visible.current || event.altKey || event.metaKey || event.ctrlKey) return false;
    const target = event.target as Element | null;
    if (isTextEntryElement(target) && !target.classList.contains('xterm-helper-textarea')) return false;
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
    <div className="asciicast-tab" data-dock={dock ?? undefined}>
      <div className="asciicast-head">
        <AsciicastMeta
          header={source.header}
          duration={playback.duration}
          live={source.live}
          exitStatus={source.exitStatus}
          problem={source.error}
        />
        {splitAction}
      </div>
      <div className="asciicast-stage" ref={containerRef} />
      <TransportBar playback={playback} />
    </div>
  );
}
