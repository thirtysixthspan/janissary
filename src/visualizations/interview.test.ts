import { describe, expect, it, vi } from 'vitest';
import type { AcpSession, PromptHandlers } from '../acp/types.js';
import type { AcpSessionPool } from '../acp/session-pool.js';
import { chartSummary, VisualizationInterviewer } from './interview.js';
import { VISUALIZATION_SCHEMA_VERSION, type VisualizationRecord } from './store.js';

const TABLE = {
  columns: [
    { name: 'region', type: 'string' as const },
    { name: 'revenue', type: 'number' as const },
  ],
  rows: [['north', 10], ['south', 4]],
  total: 2,
  truncated: false,
};

const CHART_REPLY = '{"kind":"bar","x":"region","y":"revenue","title":"Revenue by region"}';
const QUESTIONS_REPLY = '{"questions":[{"question":"Which measure?","suggestions":["revenue"]}]}';

function record(over: Partial<VisualizationRecord> = {}): VisualizationRecord {
  return {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    id: 'one',
    title: 'New visualization',
    createdAt: 1,
    updatedAt: 1,
    source: 'https://example.com/d.csv',
    pair: { harness: 'opencode', model: 'model' },
    refreshSeconds: 0,
    questions: [],
    turns: [],
    table: TABLE,
    ...over,
  };
}

// The session is a stub the test completes on demand, which is what lets one case decide when a chunk
// arrives and another decide when the call ends or fails.
function fakePool() {
  const prompts: string[] = [];
  let handlers: PromptHandlers | undefined;
  const killed: string[] = [];
  const session: AcpSession = {
    prompt: (text, given) => { prompts.push(text); handlers = given; },
    kill: vi.fn(),
  };
  const pool = {
    session: vi.fn((): AcpSession => session),
    close: vi.fn((id: string) => { killed.push(id); return true; }),
    dispose: vi.fn(),
  };
  return { pool: pool as unknown as AcpSessionPool, prompts, killed, chunk: (text: string) => { handlers?.onChunk(text); }, end: () => { handlers?.onEnd('end_turn'); }, fail: (message: string) => { handlers?.onError(message); } };
}

function fixture() {
  const { pool, prompts, killed, chunk, end, fail } = fakePool();
  const commits: { error?: string }[] = [];
  const interviewer = new VisualizationInterviewer({
    pool,
    workspace: () => '/tmp/workspace',
    now: () => 5,
    changed: vi.fn(),
    commit: (_record, error) => { commits.push(error === undefined ? {} : { error }); },
  });
  return { interviewer, commits, prompts, killed, chunk, end, fail, pool };
}

describe('the opening call', () => {
  it('stores the questions it was answered with, and commits no error', () => {
    const { interviewer, commits, prompts, chunk, end } = fixture();
    const subject = record();

    expect(interviewer.open(subject)).toBe(true);
    expect(prompts[0]).toContain('region (string)');
    chunk(QUESTIONS_REPLY);
    end();

    expect(subject.questions).toHaveLength(1);
    expect(subject.questions[0]?.question).toBe('Which measure?');
    expect(subject.chart).toBeUndefined();
    expect(commits).toEqual([{}]);
  });

  it('records the reason and stores nothing when the reply carries no questions', () => {
    const { interviewer, commits, chunk, end } = fixture();
    const subject = record();

    interviewer.open(subject);
    chunk('I am not sure what to ask.');
    end();

    expect(subject.questions).toEqual([]);
    expect(commits.at(-1)?.error).toBe('The model did not return any questions I could read.');
  });
});

describe('the closing call', () => {
  it('stores a valid chart, takes its title for an untitled record, and says what the chart is', () => {
    const { interviewer, commits, chunk, end } = fixture();
    const subject = record({ questions: [{ id: 'q1', question: 'Which measure?', suggestions: [], answer: 'revenue' }] });

    expect(interviewer.close(subject)).toBe(true);
    chunk(CHART_REPLY);
    end();

    expect(subject.chart).toEqual({ kind: 'bar', x: 'region', y: 'revenue', title: 'Revenue by region' });
    expect(subject.title).toBe('Revenue by region');
    // The answers are the query, so the turn exists without the user having typed anything.
    expect(subject.turns[0]?.query).toBe('revenue');
    expect(subject.turns[0]?.response).toBe('Now a bar chart of revenue by region.');
    expect(commits).toEqual([{}]);
  });

  it('keeps the model own words on the turn when it gave any', () => {
    const { interviewer, chunk, end } = fixture();
    const subject = record({ questions: [{ id: 'q1', question: 'Q?', suggestions: [], answer: 'a' }] });

    interviewer.close(subject);
    chunk('{"kind":"bar","x":"region","y":"revenue","title":"T","note":"revenue is the clearest measure"}');
    end();

    expect(subject.turns[0]?.response).toBe('revenue is the clearest measure');
  });

  it('names the series column in the summary when the chart is split', () => {
    expect(chartSummary({ kind: 'line', x: 'day', y: 'revenue', series: 'region', title: 'T' }))
      .toBe('Now a line chart of revenue by day, split by region.');
  });

  // This sentence is the only thing a user reads when the model changed the chart and explained nothing.
  // "Revenue by region" with no word about the reduction reads as one bar per transaction, and is not.
  it('names the aggregate in the summary, in words that fit each of the five', () => {
    expect(chartSummary({ kind: 'bar', x: 'region', y: 'revenue', aggregate: 'sum', title: 'T' }))
      .toBe('Now a bar chart of revenue by region, summed.');
    expect(chartSummary({ kind: 'bar', x: 'region', y: 'revenue', aggregate: 'mean', title: 'T' }))
      .toBe('Now a bar chart of revenue by region, averaged.');
    expect(chartSummary({ kind: 'bar', x: 'region', y: 'revenue', aggregate: 'count', title: 'T' }))
      .toBe('Now a bar chart of revenue by region, counted.');
    expect(chartSummary({ kind: 'bar', x: 'region', y: 'revenue', aggregate: 'min', title: 'T' }))
      .toBe('Now a bar chart of revenue by region, reduced to the smallest.');
    expect(chartSummary({ kind: 'bar', x: 'region', y: 'revenue', aggregate: 'max', title: 'T' }))
      .toBe('Now a bar chart of revenue by region, reduced to the largest.');
  });

  // A chart that only changes how it aggregates is still a redraw: the picture on screen is a different
  // picture, and an untitled visualization should take the name the model gave it either way.
  it('counts a change of aggregate alone as a redraw', () => {
    const { interviewer, chunk, end } = fixture();
    const subject = record({ questions: [{ id: 'q1', question: 'Q?', suggestions: [], answer: 'a' }] });

    interviewer.close(subject);
    chunk('{"kind":"bar","x":"region","y":"revenue","title":"T"}');
    end();
    expect(subject.chart?.aggregate).toBeUndefined();

    interviewer.revise(subject, 'sum it by region');
    chunk('{"kind":"bar","x":"region","y":"revenue","aggregate":"sum","title":"T","note":"summed"}');
    end();

    expect(subject.chart?.aggregate).toBe('sum');
    expect(subject.turns.at(-1)?.response).toBe('summed');
  });

  it('leaves a name the user chose alone', () => {
    const { interviewer, chunk, end } = fixture();
    const subject = record({
      title: 'Quarterly revenue',
      questions: [{ id: 'q1', question: 'Which measure?', suggestions: [], answer: 'revenue' }],
    });

    interviewer.close(subject);
    chunk(CHART_REPLY);
    end();

    expect(subject.title).toBe('Quarterly revenue');
  });

  it('stores no chart and records the reason when the chart names a column the table lacks', () => {
    const { interviewer, commits, chunk, end } = fixture();
    const subject = record({ questions: [{ id: 'q1', question: 'Q?', suggestions: [], answer: 'a' }] });

    interviewer.close(subject);
    chunk('{"kind":"bar","x":"missing","y":"revenue","title":"T"}');
    end();

    expect(subject.chart).toBeUndefined();
    expect(commits.at(-1)?.error).toBe('The model asked for a chart this data cannot show: no column named "missing".');
  });

  it('stores no chart and records the reason when the reply parses as no chart', () => {
    const { interviewer, commits, chunk, end } = fixture();
    const subject = record({ questions: [{ id: 'q1', question: 'Q?', suggestions: [], answer: 'a' }] });

    interviewer.close(subject);
    chunk('here is a bar chart');
    end();

    expect(subject.chart).toBeUndefined();
    expect(commits.at(-1)?.error).toBe('The model did not return a chart I could read.');
  });
});

describe('one call at a time', () => {
  it('refuses a second call of every kind while one is in flight', () => {
    const { interviewer } = fixture();
    const subject = record();

    expect(interviewer.open(subject)).toBe(true);
    expect(interviewer.open(subject)).toBe(false);
    expect(interviewer.close(subject)).toBe(false);
    expect(interviewer.revise(subject, 'make it a line')).toBe(false);
    expect(interviewer.busy('one')).toBe(true);
  });

  it('accepts a revise only once there is a chart to revise', () => {
    const { interviewer } = fixture();
    const subject = record();
    expect(interviewer.revise(subject, 'make it a line')).toBe(false);

    subject.chart = { kind: 'bar', x: 'region', y: 'revenue', title: 'T' };
    expect(interviewer.revise(subject, 'make it a line')).toBe(true);
  });
});

describe('a revision', () => {
  it('records the query as a streaming turn before the call, and the note on completion', () => {
    const { interviewer, chunk, end } = fixture();
    const subject = record({ chart: { kind: 'bar', x: 'region', y: 'revenue', title: 'T' } });

    interviewer.revise(subject, 'make it a line');
    expect(subject.turns).toHaveLength(1);
    expect(subject.turns[0]?.streaming).toBe(true);

    chunk('{"kind":"line","x":"region","y":"revenue","title":"T","note":"switched to a line"}');
    end();

    expect(subject.chart?.kind).toBe('line');
    expect(subject.turns[0]?.response).toBe('switched to a line');
    expect(subject.turns[0]?.streaming).toBeUndefined();
  });

  it('keeps the turn and says the reply was unreadable when no chart came back', () => {
    const { interviewer, chunk, end } = fixture();
    const subject = record({ chart: { kind: 'bar', x: 'region', y: 'revenue', title: 'T' } });

    interviewer.revise(subject, 'what is the average?');
    chunk('The average is about seven.');
    end();

    expect(subject.chart?.kind).toBe('bar');
    expect(subject.turns[0]?.response).toContain('not with one I could use');
  });

  it('falls back to what the chart is when the model changed it and said nothing', () => {
    const { interviewer, chunk, end } = fixture();
    const subject = record({ chart: { kind: 'bar', x: 'region', y: 'revenue', title: 'T' } });

    interviewer.revise(subject, 'make it a line');
    chunk('{"kind":"line","x":"region","y":"revenue","title":"T"}');
    end();

    expect(subject.chart?.kind).toBe('line');
    expect(subject.turns[0]?.response).toBe('Now a line chart of revenue by region.');
  });

  it('accumulates every chunk before the call completes', () => {
    const { interviewer, chunk, end } = fixture();
    const subject = record({ chart: { kind: 'bar', x: 'region', y: 'revenue', title: 'T' } });

    interviewer.revise(subject, 'make it a line');
    chunk('{"kind":"li');
    chunk('ne","x":"region"');
    chunk(',"y":"revenue","title":"T","note":"now a line"}');
    end();

    expect(subject.turns[0]?.response).toBe('now a line');
  });
});

describe('cancellation and failure', () => {
  it('drops the in-flight turn on cancel, and reports nothing when nothing is in flight', () => {
    const { interviewer, killed } = fixture();
    const subject = record({ chart: { kind: 'bar', x: 'region', y: 'revenue', title: 'T' } });

    expect(interviewer.cancel('one')).toBe(false);
    interviewer.revise(subject, 'make it a line');
    expect(interviewer.cancel('one')).toBe(true);
    expect(interviewer.busy('one')).toBe(false);
    expect(killed).toEqual(['one', 'one']);
  });

  it('records a rate-limited failure and closes the session', () => {
    const { interviewer, commits, killed, fail } = fixture();
    const subject = record();

    interviewer.open(subject);
    fail('rate limit exceeded, try again later');

    expect(commits.at(-1)?.error).toBe('Rate limited: rate limit exceeded, try again later');
    expect(killed).toEqual(['one']);
  });

  it('records an ordinary failure as it arrived', () => {
    const { interviewer, commits, fail } = fixture();
    const subject = record();

    interviewer.open(subject);
    fail('ACP agent exited.');

    expect(commits.at(-1)?.error).toBe('ACP agent exited.');
  });
});

describe('disposal', () => {
  it('empties the in-flight set and disposes the pool', () => {
    const { interviewer, pool } = fixture();
    const subject = record();

    interviewer.open(subject);
    interviewer.dispose();

    expect(interviewer.busy('one')).toBe(false);
    expect(pool.dispose).toHaveBeenCalledOnce();
  });
});

