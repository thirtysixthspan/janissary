import type { Playback } from './usePlayback';
import { formatClock } from './format';

// The transport row. Presentational: it renders the state it is given and reports what was pressed,
// and every action it offers also has a chord, so nothing here is the only way to do anything.
export function TransportBar({ playback }: { playback: Playback }) {
  const { position, duration, playing, speed } = playback;
  return (
    <div className="asciicast-transport">
      <button type="button" className="asciicast-button" onClick={playback.toggle}
        aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" className="asciicast-button" onClick={() => { playback.step(-1); }}
        aria-label="Previous frame" title="Previous frame (,)">◀|</button>
      <button type="button" className="asciicast-button" onClick={() => { playback.step(1); }}
        aria-label="Next frame" title="Next frame (.)">|▶</button>
      <input
        className="asciicast-scrub"
        type="range"
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.05}
        value={Math.min(position, duration)}
        aria-label="Seek"
        onChange={(event) => { playback.seek(Number(event.target.value)); }}
      />
      <span className="asciicast-clock">{formatClock(position)} / {formatClock(duration)}</span>
      <button type="button" className="asciicast-button asciicast-speed" onClick={() => { playback.cycleSpeed(1); }}
        aria-label="Playback speed" title="Playback speed ([ and ])">{speed}×</button>
    </div>
  );
}
