// Reading an asciicast file into a timeline. Both versions this app has to read become the same
// timeline, because everything downstream — playback, idle compression, the terminal — should not
// know which format a recording was written in.
//
// Two versions, because a recording written before the v3 change and one written after are both on
// disk, and because a `.cast` made by a current asciinema is a v3 file that a v2-only parser cannot
// read at all. The differences that matter: v2 states absolute times and puts the dimensions at the
// top level, while v3 states the interval since the previous event and nests them under `term`. The
// comment lines v3 permits are skipped, and an unrecognized version is refused rather than guessed at
// — half a recording read as the wrong format is worse than no recording.

export type CastResize = { cols: number; rows: number };

export type CastEvent =
  | { code: 'o'; time: number; data: string }
  | { code: 'r'; time: number; data: CastResize }
  | { code: 'x'; time: number; data: number };

export type CastColors = { fg: string; bg: string };

export type CastHeader = {
  version: 2 | 3;
  cols: number;
  rows: number;
  command: string;
  title: string;
  timestamp: number;
  idleTimeLimit?: number;
  colors?: CastColors;
};

export type CastHeaderResult = { header: CastHeader } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

function readColors(term: Record<string, unknown> | undefined): CastColors | undefined {
  if (!term || !isRecord(term.theme)) return undefined;
  const { fg, bg } = term.theme;
  if (typeof fg !== 'string' || typeof bg !== 'string') return undefined;
  return { fg, bg };
}

export function parseCastHeader(line: string): CastHeaderResult {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { error: 'the file is not an asciicast recording' };
  }
  if (!isRecord(raw)) return { error: 'the file is not an asciicast recording' };
  const version = raw.version;
  if (version !== 2 && version !== 3) {
    return { error: `unsupported asciicast version ${String(version ?? 'unknown')}` };
  }
  const term = version === 3 && isRecord(raw.term) ? raw.term : undefined;
  const cols = term?.cols ?? raw.width;
  const rows = term?.rows ?? raw.height;
  if (typeof cols !== 'number' || typeof rows !== 'number') {
    return { error: 'the recording does not declare a terminal size' };
  }
  const limit = raw.idle_time_limit;
  const colors = readColors(term);
  return {
    header: {
      version,
      cols,
      rows,
      command: readString(raw, 'command'),
      title: readString(raw, 'title'),
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : 0,
      ...(typeof limit === 'number' && { idleTimeLimit: limit }),
      ...(colors && { colors }),
    },
  };
}

function parseResize(data: unknown): CastResize | undefined {
  if (typeof data !== 'string') return undefined;
  const [cols, rows] = data.split('x');
  if (!/^\d+$/u.test(cols ?? '') || !/^\d+$/u.test(rows ?? '')) return undefined;
  return { cols: Number(cols), rows: Number(rows) };
}

// The incremental reader. Text arrives in whatever chunks the ranged reads return, and a chunk can
// end anywhere — mid-line, or mid-line and mid-UTF-8-sequence, which the caller's streaming decoder
// absorbs — so the tail is held until the rest of it arrives. A recording still being written is the
// normal case, not an error, and a held partial line is not a failure either.
export class CastStream {
  private buffer = '';
  private parsed: CastEvent[] = [];
  private clock = 0;
  private headerValue: CastHeader | undefined;
  private errorValue: string | undefined;
  private exit: number | null = null;

  get header(): CastHeader | undefined { return this.headerValue; }
  get error(): string | undefined { return this.errorValue; }
  get events(): readonly CastEvent[] { return this.parsed; }
  // How the session ended, or nothing when the recording never says — which is every recording ended
  // by closing its tab, and is one of the two things that tell a finished recording from a live one.
  get exitStatus(): number | undefined { return this.exit ?? undefined; }
  get duration(): number { return this.parsed.length === 0 ? 0 : this.parsed.at(-1)!.time; }

  push(text: string): CastEvent[] {
    if (this.errorValue) return [];
    const added: CastEvent[] = [];
    this.buffer += text;
    // Everything up to the last newline is a complete line; the remainder is the tail, held until
    // the rest of it arrives. This is the ordinary case rather than an error — a recording being
    // written right now ends wherever its last flush ended.
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) this.readLine(line, added);
    this.parsed.push(...added);
    return added;
  }

  // Blank lines and v3's comment lines carry nothing and are not errors.
  private readLine(line: string, added: CastEvent[]): void {
    if (!line) return;
    if (!this.headerValue) {
      if (line.startsWith('#')) return;
      const result = parseCastHeader(line);
      if ('error' in result) this.errorValue = result.error;
      else this.headerValue = result.header;
      return;
    }
    if (line.startsWith('#') || line.trim() === '') return;
    const event = this.parseEvent(line);
    if (!event) return;
    added.push(event);
    if (event.code === 'x') this.exit = event.data;
  }

  private parseEvent(line: string): CastEvent | undefined {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      // A truncated line is not this class's problem to report: it is the tail this reader is still
      // holding. A whole line that will not parse is a recording written by something else.
      this.errorValue = 'the recording holds a line that is not an asciicast event';
      return undefined;
    }
    if (!Array.isArray(raw)) return undefined;
    const [stamp, code, data] = raw as [unknown, unknown, unknown];
    const seconds = typeof stamp === 'number' ? stamp : 0;
    // v3 states the gap since the previous event; v2 states the time since the start.
    const time = this.headerValue?.version === 3 ? this.clock + seconds : seconds;
    this.clock = time;
    if (code === 'o' && typeof data === 'string') return { code: 'o', time, data };
    if (code === 'x') {
      // The exit status is a number in the format and arrives as one in JSON, but a recording written
      // by hand may quote it; either way a player shows the number or nothing.
      const status = typeof data === 'number' ? data : Number(data);
      return { code: 'x', time, data: Number.isFinite(status) ? status : 0 };
    }
    if (code === 'r') {
      const resize = parseResize(data);
      return resize && { code: 'r', time, data: resize };
    }
    // `i` input events are never recorded here, and `m` markers are not supported; anything else is
    // a code this version does not know, which the format says to ignore rather than refuse.
    return undefined;
  }
}
