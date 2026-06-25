import { describe, it, expect } from 'vitest';
import { analyzeCommand, routeChoices, toPrefixedCommand, HIGH_RELIABILITY } from './analyze.js';

const noDatabase = { openDbs: [] as string[] };
const oneDatabase = { openDbs: ['movies'] };

describe('analyzeCommand', () => {
  it('routes a clear shell command to shell', () => {
    const d = analyzeCommand('git status', noDatabase);
    expect(d).toEqual({ kind: 'route', route: 'shell', reliability: expect.any(Number) });
  });

  it('routes a SQL query to db when a connection is open', () => {
    const d = analyzeCommand('SELECT * FROM actors', oneDatabase);
    expect(d.kind).toBe('route');
    if (d.kind === 'route') expect(d.route).toBe('db');
  });

  it('routes a clear question to acp', () => {
    const d = analyzeCommand('why is the sky blue?', noDatabase);
    expect(d.kind).toBe('route');
    if (d.kind === 'route') expect(d.route).toBe('acp');
  });

  it('routes a question that opens with a command-like word to acp, not shell', () => {
    // "which" is also a shell command, but here it leads an English question.
    const d = analyzeCommand('which file is the longest', noDatabase);
    expect(d.kind).toBe('route');
    if (d.kind === 'route') expect(d.route).toBe('acp');
  });

  it('still routes a real command invocation to shell', () => {
    const d = analyzeCommand('which node', noDatabase);
    expect(d.kind).toBe('route');
    if (d.kind === 'route') expect(d.route).toBe('shell');
  });

  it('falls back to ambiguous when SQL has no db to run against', () => {
    // Without an open db, the SQL only reads as weak prose -> not confident.
    const d = analyzeCommand('SELECT * FROM actors', noDatabase);
    expect(d.kind).toBe('ambiguous');
  });

  it('is ambiguous for a bare token that matches nothing', () => {
    const d = analyzeCommand('movies', oneDatabase);
    expect(d.kind).toBe('ambiguous');
    if (d.kind === 'ambiguous') expect(d.candidates.length).toBe(0);
  });

  it('only auto-routes above the reliability threshold', () => {
    const d = analyzeCommand('git status', noDatabase);
    if (d.kind === 'route') expect(d.reliability).toBeGreaterThanOrEqual(HIGH_RELIABILITY);
  });
});

describe('routeChoices / toPrefixedCommand', () => {
  it('offers shell and acp, plus a db choice per open connection', () => {
    expect(routeChoices(['movies', 'actors']).map((c) => c.route)).toEqual(['shell', 'db', 'db', 'acp']);
  });

  it('omits db choices when nothing is open', () => {
    expect(routeChoices([]).map((c) => c.route)).toEqual(['shell', 'acp']);
  });

  it('prefixes shell and acp commands', () => {
    expect(toPrefixedCommand('ls -la', { label: '', route: 'shell' })).toBe('shell ls -la');
    expect(toPrefixedCommand('summarize this', { label: '', route: 'acp' })).toBe('acp summarize this');
  });

  it('wraps a db query as a db sqlite query against the chosen database', () => {
    expect(toPrefixedCommand('SELECT 1', { label: '', route: 'db', dbName: 'movies' }))
      .toBe('db sqlite query movies SELECT 1');
  });
});
