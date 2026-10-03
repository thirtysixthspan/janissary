import type { CastHeader } from './cast-stream';
import { formatClock, formatStartedAt } from './format';

// The line above the played-back terminal: what the recording is, when it started, how long it is, how
// its session ended, and whether it is still being written. Dotted facts rather than a sentence,
// because each one is optional — a recording made by another tool carries no title, an older format
// carries no command — and a sentence would have to be reworded for every combination that is missing.
//
// A reason appears here rather than in place of the player: a recording that will not parse, or one
// with no events yet, still opens as a player, so the first good frame has somewhere to go.
export function AsciicastMeta({
  header, duration, live, exitStatus, problem,
}: {
  header: CastHeader | undefined;
  duration: number;
  live: boolean;
  exitStatus?: number;
  problem?: string;
}) {
  const started = formatStartedAt(header?.timestamp ?? 0);
  return (
    <div className="asciicast-meta">
      {[header?.command, header?.title, started && `started ${started}`,
        duration > 0 && formatClock(duration),
        exitStatus !== undefined && `exit ${exitStatus}`]
        .filter((fact): fact is string => !!fact)
        .join(' · ')}
      {live && <span className="asciicast-live">live</span>}
      {problem && <span className="asciicast-problem">{problem}</span>}
    </div>
  );
}
