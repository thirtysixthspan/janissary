// The asciicast v3 header of one recorded session. The dimensions moved under `term` in v3, the
// terminal type moved there from `env`, and `env` went away entirely because `TERM` was the only
// variable this recorder ever captured and `term.type` is where it now belongs.
//
// `idle_time_limit` is written rather than left out because the whole reason to record an unattended
// harness run is that the run is mostly silence: a player told to compress a gap longer than this
// makes an hour of recording watchable, and one told nothing has to sit through the silences. Two
// seconds is the value asciinema's own documentation recommends. `theme` carries only the two colors
// this app themes — the 16 ANSI colors are xterm's built-in constant and are identical on every
// recording this makes, so there is no palette to record and an incomplete theme is deliberate.
import type { TerminalColors } from './terminal-colors.js';

export type CastHeaderInput = {
  cols: number;
  rows: number;
  timestamp: number;
  idleTimeLimit: number;
  command: string;
  title: string;
  colors?: TerminalColors;
};

export function castHeader(input: CastHeaderInput): Record<string, unknown> {
  return {
    version: 3,
    term: {
      cols: input.cols,
      rows: input.rows,
      type: 'xterm-256color',
      ...(input.colors && {
        theme: { fg: input.colors.fg, bg: input.colors.bg },
      }),
    },
    timestamp: Math.floor(input.timestamp / 1000),
    idle_time_limit: input.idleTimeLimit,
    command: input.command,
    title: input.title,
  };
}
