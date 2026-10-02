import { describe, expect, it } from 'vitest';
import { CastStream, parseCastHeader } from './cast-stream';

const V2_HEADER = JSON.stringify({
  version: 2, width: 120, height: 40, timestamp: 1_504_467_315, command: 'claude', title: 'claude',
  idle_time_limit: 2, env: { TERM: 'xterm-256color' },
});

const V3_HEADER = JSON.stringify({
  version: 3,
  term: {
    cols: 100, rows: 30, type: 'xterm-256color', theme: { fg: '#e4e5e7', bg: '#17181b' },
  },
  timestamp: 1_504_467_315,
  idle_time_limit: 2,
  command: 'ssh -p 2222 admin@host',
  title: 'devbox',
});

// The same timeline in both formats: v2 states absolute times, v3 the gap since the previous event,
// and one nests its dimensions under `term` while the other puts them at the top level.
const V2_EVENTS = [
  [0, 'o', 'one'],
  [1.5, 'o', 'two'],
  [2, 'r', '100x30'],
  [3, 'o', 'three'],
];

const V3_EVENTS = [
  [0, 'o', 'one'],
  [1.5, 'o', 'two'],
  [0.5, 'r', '100x30'],
  [1, 'o', 'three'],
];

const timeline = (header: string, lines: string[]) => {
  const stream = new CastStream();
  stream.push([header, ...lines].join('\n') + '\n');
  return stream;
};

describe('parseCastHeader', () => {
  it('reads a v2 header, with its dimensions at the top level', () => {
    const result = parseCastHeader(V2_HEADER);
    expect(result).toMatchObject({
      header: { version: 2, cols: 120, rows: 40, title: 'claude' },
    });
    // The format permits an idle limit and neither header shape reads it: a recording plays at the
    // timing it states, and a file carrying one is not refused for it.
    expect(result).not.toHaveProperty('header.idleTimeLimit');
  });

  it('reads a v3 header, with its dimensions and colors under term', () => {
    const result = parseCastHeader(V3_HEADER);
    expect(result).toMatchObject({
      header: {
        version: 3, cols: 100, rows: 30, title: 'devbox',
        colors: { fg: '#e4e5e7', bg: '#17181b' },
      },
    });
  });

  it.each([
    ['not json at all', 'this is not a cast file'],
    ['a json array rather than an object', '[]'],
    ['a version it does not know', '{"version":1,"width":80,"height":24}'],
    ['a header with no terminal size', '{"version":2}'],
  ])('refuses %s with a reason the metadata line can show', (_case, line) => {
    const result = parseCastHeader(line);
    expect('error' in result && result.error.length > 0).toBe(true);
  });
});

describe('CastStream', () => {
  it('produces the same timeline from a v2 file and the v3 file that says the same thing', () => {
    const v2 = timeline(V2_HEADER, V2_EVENTS.map((event) => JSON.stringify(event)));
    const v3 = timeline(V3_HEADER, V3_EVENTS.map((event) => JSON.stringify(event)));
    expect(v3.events).toEqual(v2.events);
    expect(v2.error).toBeUndefined();
    expect(v2.events.at(-2)).toEqual({ code: 'r', time: 2, data: { cols: 100, rows: 30 } });
  });

  it('holds a partial trailing line until the rest of it arrives', () => {
    const stream = new CastStream();
    stream.push(V3_HEADER + '\n[0, "o", "par');
    expect(stream.events).toHaveLength(0);
    stream.push('tial"]\n');
    expect(stream.events).toEqual([{ code: 'o', time: 0, data: 'partial' }]);
  });

  it('skips the comment lines v3 permits, including before the header', () => {
    const stream = new CastStream();
    stream.push(`# a comment\n${V3_HEADER}\n# another\n[0, "o", "x"]\n`);
    expect(stream.header?.title).toBe('devbox');
    expect(stream.events).toHaveLength(1);
  });

  it('reports an unparseable whole line, and ignores event codes it does not know', () => {
    const stream = new CastStream();
    stream.push(`${V3_HEADER}\n[0, "m", "marker"]\n[0, "i", "k"]\n[0, "o", "kept"]\n`);
    expect(stream.error).toBeUndefined();
    expect(stream.events).toEqual([{ code: 'o', time: 0, data: 'kept' }]);

    const broken = new CastStream();
    broken.push(`${V3_HEADER}\n{not an event}\n`);
    expect(broken.error).toContain('asciicast event');
  });

  it('reports the exit status once the recording says how the session ended', () => {
    const stream = new CastStream();
    stream.push(`${V3_HEADER}\n[0, "o", "bye"]\n[0.5, "x", "130"]\n`);
    expect(stream.exitStatus).toBe(130);
    expect(stream.duration).toBe(0.5);
  });

  it('leaves the exit status unset for a recording that never reports one', () => {
    const stream = new CastStream();
    stream.push(`${V3_HEADER}\n[0, "o", "bye"]\n`);
    expect(stream.exitStatus).toBeUndefined();
  });

  it('has no header and no error before the first line arrives', () => {
    const stream = new CastStream();
    stream.push('');
    expect(stream.header).toBeUndefined();
    expect(stream.error).toBeUndefined();
    expect(stream.duration).toBe(0);
  });
});
