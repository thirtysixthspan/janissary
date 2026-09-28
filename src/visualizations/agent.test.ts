import { describe, expect, it, vi } from 'vitest';
import type { AcpSession, PromptHandlers } from '../acp/types.js';
import type { AcpSessionPool } from '../acp/session-pool.js';
import { VisualizationAgent } from './agent.js';
import { drawn } from './charts.js';
import { VISUALIZATION_SCHEMA_VERSION, type VisualizationRecord } from './store.js';
import type { VisualizationChartRecord, VisualizationTableView } from '../protocol.js';

const TABLE: VisualizationTableView = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
  ],
  rows: [['north', 10], ['south', 4]],
  total: 2,
  truncated: false,
};

// A record with the source already read, which is the state every message but the first arrives in.
function record(over: Partial<VisualizationRecord> = {}): VisualizationRecord {
  return {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    id: 'one',
    title: 'New visualization',
    createdAt: 1,
    updatedAt: 1,
    source: 'https://example.com/d.csv',
    pair: { harness: 'opencode', model: 'model' },
    datasets: [{ key: 'source', table: TABLE, readAt: 1 }],
    charts: [],
    metrics: [],
    notices: [],
    instructions: [],
    turns: [],
    ...over,
  };
}

function reply(chart: Record<string, unknown> = {}, top: Record<string, unknown> = {}): string {
  return JSON.stringify({
    say: '',
    charts: [{ kind: 'bar', x: 'region', y: 'revenue', title: 'Revenue by region', ...chart }],
    remove: [],
    followUps: [],
    ...top,
  });
}

// A chart that has been drawn, so a test can change it rather than build it.
function withChart(subject: VisualizationRecord, title = 'Revenue by region'): VisualizationChartRecord {
  const made = drawn(
    subject,
    { kind: 'source' },
    [],
    { kind: 'bar', x: 'region', y: 'revenue', title },
    'chart-1',
    0,
  );
  if ('error' in made) throw new Error(made.error);
  subject.charts = [made.chart];
  return made.chart;
}

// The session is a stub the test completes on demand, which is what lets one case decide when a chunk
// arrives and another decide when the call ends or fails.
function fixture() {
  const prompts: string[] = [];
  const allowed: boolean[] = [];
  const killed: string[] = [];
  let handlers: PromptHandlers | undefined;
  const pool = {
    session: vi.fn((_id, _pair, _dir, hooks) => {
      allowed.push(hooks?.allowEveryTool === true);
      return {
        prompt: (text: string, given: PromptHandlers) => { prompts.push(text); handlers = given; },
        kill: vi.fn(),
      } as AcpSession;
    }),
    close: vi.fn((id: string) => { killed.push(id); return true; }),
    dispose: vi.fn(),
  };
  const commits: { error?: string }[] = [];
  const reacquired: string[] = [];
  const acquired: string[] = [];
  const agent = new VisualizationAgent({
    pool: pool as unknown as AcpSessionPool,
    workspace: () => '/tmp/workspace',
    now: () => 5,
    changed: vi.fn(),
    commit: (_record, error) => { commits.push(error === undefined ? {} : { error }); },
    reacquired: (_record, data) => { reacquired.push(data.kind === 'source' ? 'source' : data.path); },
    acquire: (_record, data) => { acquired.push(data.kind === 'source' ? 'source' : data.path); },
  });
  return {
    agent,
    acquired,
    commits,
    reacquired,
    prompts,
    allowed,
    killed,
    chunk: (text: string) => { handlers?.onChunk(text); },
    end: () => { handlers?.onEnd('end_turn'); },
    fail: (message: string) => { handlers?.onError(message); },
  };
}

const settled = async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); };
const ready = async (): Promise<unknown> => { /* nothing to do first */ };

describe('a message', () => {
  it('asks the model with the data in hand, and stores the turn before the call goes out', async () => {
    const { agent, prompts, chunk, end } = fixture();
    const subject = record();

    expect(agent.ask(subject, 'plot revenue by region', ready)).toBe(true);
    await settled();
    expect(subject.turns).toHaveLength(1);
    expect(subject.turns[0]).toMatchObject({ query: 'plot revenue by region', streaming: true });
    expect(prompts[0]).toContain('region (string)');
    expect(agent.busy('one')).toBe(true);

    chunk(reply());
    end();
    expect(subject.turns[0]?.streaming).toBeUndefined();
    expect(agent.busy('one')).toBe(false);
  });

  it('runs whatever the caller needed first, and tells the model about a refusal', async () => {
    const { agent, prompts, chunk, end } = fixture();
    const subject = record({ source: '' });

    agent.ask(subject, 'javascript:alert(1)', async () => 'The address javascript:alert(1) was refused.');
    await settled();
    await settled();
    expect(prompts[0]).toContain('The address javascript:alert(1) was refused.');
    chunk('{"say":"Give me an address."}');
    end();
    expect(subject.turns[0]?.response).toBe('Give me an address.');
  });

  it('refuses a second message while one is in flight, and a blank one at any time', async () => {
    const { agent, prompts } = fixture();
    const subject = record();
    agent.ask(subject, 'first', ready);
    await settled();
    expect(agent.ask(subject, 'second', ready)).toBe(false);
    await settled();
    expect(agent.ask(subject, ' '.repeat(3), ready)).toBe(false);
    expect(prompts).toHaveLength(1);
  });

  it('asks the agent for its tools, and is the only caller that does', async () => {
    const { agent, allowed } = fixture();
    agent.ask(record(), 'go', ready);
    await settled();
    expect(allowed).toEqual([true]);
  });

  // The turn is committed the moment it is accepted, so there is one write here and no second: the
  // record was gone before the call went out, and the point of the case is that nothing followed it.
  it('abandons the call when the record went away while the source was being read', async () => {
    const { agent, prompts, commits } = fixture();
    const subject = record();
    agent.ask(subject, 'go', async () => { subject.id = 'gone'; });
    await settled();
    await settled();
    expect(prompts).toHaveLength(0);
    expect(commits).toHaveLength(1);
  });

  it('accumulates a reply arriving in several chunks before it reads any of it', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    chunk('{"say":"one ');
    chunk('and a half"}');
    end();
    expect(subject.turns[0]?.response).toBe('one and a half');
  });

  it('reports a reply it could not read rather than storing nothing', async () => {
    const { agent, commits, chunk, end } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    chunk('I would rather not answer in JSON.');
    end();
    expect(subject.turns[0]?.response).toContain('could not read');
    expect(commits.at(-1)?.error).toBe('The model did not reply with anything I could read.');
  });
});

describe('a reply that draws', () => {
  it('adds a chart, names an untitled visualization after it, and keeps the suggestions', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(reply({}, { say: 'Here it is.', followUps: ['make it a line chart'] }));
    end();

    expect(subject.charts).toHaveLength(1);
    expect(subject.charts[0]?.title).toBe('Revenue by region');
    expect(subject.title).toBe('Revenue by region');
    expect(subject.followUps).toEqual(['make it a line chart']);
    expect(subject.turns[0]?.response).toBe('Here it is.');
  });

  it('merges a chart carrying an id and leaves the fields it did not mention alone', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({ say: '', charts: [{ id: 'chart-1', kind: 'bar', x: 'region', y: 'revenue', title: 'Renamed' }] }));
    end();

    expect(subject.charts).toHaveLength(1);
    expect(subject.charts[0]?.title).toBe('Renamed');
    expect(subject.charts[0]?.id).toBe('chart-1');
  });

  it('adds a chart whose id names nothing, keeping the id it was given', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(reply({ id: 'fresh' }));
    end();
    expect(subject.charts.map((chart) => chart.id).toSorted((a, b) => a.localeCompare(b))).toEqual(['chart-1', 'fresh']);
  });

  it('drops a chart by id, and says so when the id is not there', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({ say: '', charts: [], remove: ['chart-1', 'nope'] }));
    end();
    expect(subject.charts).toHaveLength(0);
    expect(subject.turns[0]?.response).toContain('There is no chart "nope" to remove.');
  });

  it('refuses a chart it cannot draw and says why beneath the model\'s own words', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({
      say: 'Two of them.',
      charts: [
        { kind: 'bar', x: 'region', y: 'revenue', title: 'Fine' },
        { kind: 'bar', x: 'region', y: 'nope', title: 'Wrong' },
      ],
    }));
    end();
    expect(subject.charts).toHaveLength(1);
    expect(subject.turns[0]?.response).toBe('Two of them.\n\nNot drawn: no column named "nope".');
  });

  // A reply naming more charts than the record has room for is cut at the room, not refused wholesale:
  // the charts that fit are what the user asked for, and the message says how many did not.
  it('cuts a reply naming more charts than the record has room for', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({
      say: 'All of them.',
      charts: Array.from({ length: 9 }, (_, index) => ({ kind: 'bar', x: 'region', y: 'revenue', title: `R${index}` })),
    }));
    end();
    expect(subject.charts).toHaveLength(8);
    expect(subject.turns[0]?.response).toContain('may hold 8 charts');
  });

  // The read is the expensive half of acquiring a file, and a reply naming fifty of them would spend
  // the dataset ceiling on charts about to be refused. The refusal therefore comes before the read.
  it('refuses a new data source past the ceiling without reading it', async () => {
    const { agent, acquired, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    const made = subject.charts[0]!;
    subject.charts = Array.from({ length: 7 }, (_, index) => ({ ...made, id: `c${index}`, data: { kind: 'file', path: `d${index}.json` } }));
    subject.datasets = [{ key: 'source' }, ...Array.from({ length: 7 }, (_, index) => ({ key: `d${index}.json` }))];
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({ say: 'One more.', charts: [{ kind: 'bar', x: 'region', y: 'revenue', title: 'New', data: { kind: 'file', path: 'new.json' } }] }));
    end();
    expect(acquired).toEqual([]);
    expect(subject.charts).toHaveLength(7);
    expect(subject.turns[0]?.response).toContain('may read 8 data sources');
  });

  // A dataset is dropped when the last chart drawing from it goes, so the ceiling is a bound on what is
  // in use rather than on what has ever been named.
  it('drops a dataset nothing reads any more', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    subject.datasets = [{ key: 'source' }, { key: 'old.json' }];
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({ say: 'Gone.', charts: [], remove: ['chart-1'] }));
    end();
    expect(subject.datasets).toEqual([{ key: 'source' }]);
  });

  it('refuses a chart past the ceiling rather than dropping one already there', async () => {    const { agent, chunk, end } = fixture();
    const subject = record();
    const made = withChart(subject);
    subject.charts = Array.from({ length: 8 }, (_, index) => ({ ...made, id: `c${index}` }));
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(reply());
    end();
    expect(subject.charts).toHaveLength(8);
    expect(subject.turns[0]?.response).toContain('may hold 8 charts');
  });

  // The whole of a named measure: a turn introduces it, a later chart states only the name, and the two
  // charts are the same measurement by construction rather than by the model having typed the same column
  // twice.
  it('draws a chart that names a measure a previous turn defined', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({
      say: 'From now on, p95 latency.',
      charts: [],
      metrics: [{ name: 'p95 latency', y: 'revenue', aggregate: 'percentile', percentile: 95 }],
    }));
    end();
    agent.ask(subject, 'chart it', ready);
    await settled();
    chunk(reply({ metric: 'p95 latency' }));
    end();

    expect(subject.charts[0]?.y).toBe('revenue');
    expect(subject.charts[0]?.aggregate).toBe('percentile');
    expect(subject.charts[0]?.percentile).toBe(95);
    expect(subject.charts[0]?.metric).toBe('p95 latency');
  });

  it('refuses a chart naming a measure that does not exist, and names it', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(reply({ metric: 'p99 latency' }));
    end();
    expect(subject.charts).toHaveLength(0);
    expect(subject.turns[0]?.response).toContain('there is no measure named "p99 latency"');
  });

  // The whole of an undo: a removal comes back, and the turn says what it did so the button does not have
  // to guess.
  it('carries a copy of the charts a turn changed, and names what it changed', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({ say: 'One fewer.', charts: [], remove: ['chart-1'] }));
    end();
    expect(subject.charts).toHaveLength(0);
    expect(subject.turns[0]?.undo).toBe('removed "Revenue by region"');
    expect(subject.turns[0]?.before).toHaveLength(1);
  });

  it('carries no copy for a turn that only answered a question', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({ say: 'It is revenue by region.', charts: [] }));
    end();
    expect(subject.turns[0]?.undo).toBeUndefined();
    expect(subject.turns[0]?.before).toBeUndefined();
  });

  it('names a chart it changed rather than only one it removed', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(reply({ id: 'chart-1', aggregate: 'mean' }));
    end();
    expect(subject.turns[0]?.undo).toBe('changed "Revenue by region"');
  });

  it('renames the visualization when the reply names it and nothing has named it yet', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    withChart(subject, 'Revenue by region');
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({ say: '', name: 'Regional revenue', charts: [] }));
    end();
    expect(subject.title).toBe('Regional revenue');
  });

  it('leaves a name alone once one is set', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record({ title: 'Regional revenue' });
    withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(JSON.stringify({ say: '', name: 'Something else', charts: [{ kind: 'line', x: 'region', y: 'revenue', title: 'Trend' }] }));
    end();
    expect(subject.title).toBe('Regional revenue');
  });

  it('leaves a sentence composed from the specification when the model said nothing', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    chunk(reply());
    end();
    expect(subject.turns[0]?.response).toBe('Now a bar chart of revenue by region.');
  });
});

describe('a live update', () => {
  it('re-asks for the file and reads it back once the reply lands, adding no turn', async () => {
    const { agent, prompts, reacquired, chunk, end } = fixture();
    const subject = record();
    const file = drawn(
      { ...subject, datasets: [{ key: 'data.json', table: TABLE, readAt: 1 }] },
      { kind: 'file', path: 'data.json' },
      [],
      { kind: 'bar', x: 'region', y: 'revenue', title: 'Revenue by region' },
      'chart-1',
      30,
    );
    if ('error' in file) throw new Error(file.error);
    subject.charts = [file.chart];

    expect(agent.reacquire(subject, file.chart)).toBe(true);
    await settled();
    await settled();
    expect(prompts[0]).toContain('Fetch it again');
    expect(subject.turns).toHaveLength(0);

    chunk(reply());
    end();
    expect(reacquired).toEqual(['data.json']);
  });

  it('refuses while a message is in flight', async () => {
    const { agent } = fixture();
    const subject = record();
    const made = withChart(subject);
    agent.ask(subject, 'go', ready);
    await settled();
    expect(agent.reacquire(subject, made)).toBe(false);
    await settled();
  });
});

describe('failing and cancelling', () => {
  it('recognizes a rate limit the way acp reports it', async () => {
    const { agent, commits, fail } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    fail('rate limit exceeded, try again later');
    expect(commits.at(-1)?.error).toMatch(/^Rate limited: /u);
  });

  it('closes the session and clears the streaming flag on a failure', async () => {
    const { agent, killed, fail } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    fail('the agent went away');
    expect(killed).toEqual(['one']);
    expect(subject.turns[0]).toMatchObject({ response: 'The model could not be reached.' });
    expect(subject.turns[0]?.streaming).toBeUndefined();
  });

  it('kills the session on cancel and forgets the call', async () => {
    const { agent, killed } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    expect(agent.cancel('one')).toBe(true);
    expect(killed).toEqual(['one']);
    expect(agent.busy('one')).toBe(false);
    expect(subject.turns[0]?.streaming).toBe(true);
  });

  it('ignores a reply that arrives after the call was cancelled', async () => {
    const { agent, chunk, end } = fixture();
    const subject = record();
    agent.ask(subject, 'go', ready);
    await settled();
    const stale = chunk;
    agent.cancel('one');
    stale(reply());
    end();
    expect(subject.charts).toHaveLength(0);
  });
});
