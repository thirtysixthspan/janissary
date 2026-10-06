// The asciicast v3 header of one recorded session. The dimensions moved under `term` in v3, the
// terminal type moved there from `env`, and `env` went away entirely because `TERM` was the only
// variable this recorder ever captured and `term.type` is where it now belongs.
//
// `theme` carries what the client's terminal surface resolved: the two colors this app themes plus
// the 16 ANSI ones. The palette used to be left out on purpose — the reasoning was that the 16 are
// xterm's built-in constant, identical on every recording, so there was nothing to record and an
// incomplete theme was deliberate. That no longer holds: the format specifies `fg`, `bg` and
// `palette` together, so a two-key theme is one this app knows to be incomplete and writes anyway,
// into a file whose whole value is being replayable by other players. The application also now has
// somewhere to put a real palette (`web/src/theme.css` declares the sixteen, defaulting to xterm's
// values, so a theme that wants its own overrides them) — which is what turns this from spec
// conformance into fidelity the moment anyone picks one.
//
// There is no `idle_time_limit`: a recording plays at the timing it happened at, and a limit written
// here would only tell a player to rewrite that timing.
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
        theme: {
          fg: input.colors.fg,
          bg: input.colors.bg,
          // Omitted rather than written empty when no palette was reported, so a recording made by a
          // surface that reports only `fg`/`bg` keeps exactly the header it always had.
          ...(input.colors.palette && { palette: input.colors.palette.join(':') }),
        },
      }),
    },
    timestamp: Math.floor(input.timestamp / 1000),
    command: input.command,
    title: input.title,
  };
}