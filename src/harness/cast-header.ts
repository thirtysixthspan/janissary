// The asciicast v3 header of one recorded session. The dimensions moved under `term` in v3, the
// terminal type moved there from `env`, and `env` went away entirely because `TERM` was the only
// variable this recorder ever captured and `term.type` is where it now belongs.
//
// `theme` carries only the two colors this app themes — the 16 ANSI colors are xterm's built-in
// constant and are identical on every recording this makes, so there is no palette to record and an
// incomplete theme is deliberate. There is no `idle_time_limit`: a recording plays at the timing it
// happened at, and a limit written here would only tell a player to rewrite that timing.
import type { TerminalColors } from './terminal-colors.js';

export type CastHeaderInput = {
  cols: number;
  rows: number;
  timestamp: number;
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
    command: input.command,
    title: input.title,
  };
}
