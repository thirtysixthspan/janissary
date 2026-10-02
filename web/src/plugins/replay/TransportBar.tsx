import type { Playback } from './usePlayback';
import { formatClock } from './format';

// The transport row. Presentational: it renders the state it is given and reports what was pressed,
// and every action it offers also has a chord, so nothing here is the only way to do anything.
export function TransportBar({ playback }: { playback: Playback }) {
  const { position, duration, playing, speed, idleLimit } = playback;
  return (
    <div className="replay-transport">
      <button type="button" className="replay-button" onClick={playback.toggle}
        aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" className="replay-button" onClick={() => { playback.step(-1); }}
        aria-label="Previous frame" title="Previous frame (,)">◀|</button>
      <button type="button" className="replay-button" onClick={() => { playback.step(1); }}
        aria-label="Next frame" title="Next frame (.)">|▶</button>
      <input
        className="replay-scrub"
        type="range"
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.05}
        value={Math.min(position, duration)}
        aria-label="Seek"
        onChange={(event) => { playback.seek(Number(event.target.value)); }}
      />
      <span className="replay-clock">{formatClock(position)} / {formatClock(duration)}</span>
      <button type="button" className="replay-button replay-speed" onClick={() => { playback.cycleSpeed(1); }}
        aria-label="Playback speed" title="Playback speed ([ and ])">{speed}×</button>
      <button type="button" className="replay-button replay-idle" onClick={playback.cycleIdle}
        aria-label="Idle time limit" title="Idle time limit (i)">
        idle {idleLimit === 'off' ? 'off' : `${idleLimit}s`}
      </button>
    </div>
  );
}
