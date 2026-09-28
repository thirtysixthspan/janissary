import { describe, expect, it } from 'vitest';
import { chatPrompt, refreshPrompt } from './prompts.js';
import { parseReply } from './reply.js';
import { VISUALIZATION_SCHEMA_VERSION, type VisualizationRecord } from './store.js';
import type { VisualizationTableView } from '../protocol.js';

const TABLE: VisualizationTableView = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
  ],
  rows: [['north', 10], ['south', 4]],
  total: 2,
  truncated: false,
};

const WORKSPACE = { workspace: '/tmp/workspace' };

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
    instructions: [],
    turns: [],
    ...over,
  };
}

describe('the prompt', () => {
  it('names the source, its columns, their types, its rows, and the first of them', () => {
    const text = chatPrompt(record(), WORKSPACE);
    expect(text).toContain('the source the user pointed at');
    expect(text).toContain('- region (string)');
    expect(text).toContain('- revenue (number)');
    expect(text).toContain('Rows available: 2');
    expect(text).toContain('[["north",10],["south",4]]');
  });

  it('names the workspace the agent may write into', () => {
    expect(chatPrompt(record(), WORKSPACE)).toContain('Their workspace is /tmp/workspace');
  });

  it('says a cap is a cap rather than presenting the kept rows as the whole source', () => {
    const text = chatPrompt(record({
      datasets: [{ key: 'source', table: { ...TABLE, rows: TABLE.rows.slice(0, 1), total: 12_043, truncated: true } }],
    }), WORKSPACE);
    expect(text).toContain('(of 12043 read; only the first 1 are kept)');
  });

  // The whole of the API case: the model is handed the page, because working out what it describes is
  // its job and it cannot do it from a summary.
  it('hands over a page verbatim, and says what to do with it', () => {
    const page = '<html>GET /sales?year=</html>';
    const text = chatPrompt(record({ datasets: [{ key: 'source', document: page }] }), WORKSPACE);
    expect(text).toContain('It is not itself a table');
    expect(text).toContain(page);
    expect(text).toContain('write what you fetched into your workspace');
  });

  it('names a file the agent acquired as that file', () => {
    const text = chatPrompt(record({
      datasets: [{ key: 'source', table: TABLE }, { key: 'data.json', table: TABLE }],
    }), WORKSPACE);
    expect(text).toContain('the file "data.json" you acquired');
  });

  it('carries the exchange, and no more than the last twelve turns', () => {
    const turns = Array.from({ length: 14 }, (_, index) => ({
      query: `ask ${index}`, response: `answer ${index}`, pair: { harness: 'opencode' as const, model: 'm' },
    }));
    const text = chatPrompt(record({ turns }), WORKSPACE);
    expect(text).toContain('User: ask 13');
    expect(text).not.toContain('User: ask 0');
  });

  it('states the contract, the five kinds, the aggregates and the four transformations', () => {
    const text = chatPrompt(record(), WORKSPACE);
    expect(text).toContain('Reply with one JSON object and nothing else');
    expect(text).toContain('bar, line, area, scatter, pie');
    expect(text).toContain('"sum", "mean", "median", "percentile", "variance", "count", "distinct", "min", "max"');
    expect(text).toContain('"op":"filter"');
    expect(text).toContain('"op":"derive"');
    expect(text).toContain('"op":"sort"');
    expect(text).toContain('"op":"limit"');
    expect(text).toContain('{"kind":"source"}');
    expect(text).toContain('{"kind":"file","path":"…"}');
  });

  // A note about the source used to stand in for the data section, so the moment anything in a message
  // looked like a refused address the model lost the columns, the row count and the sample of a source
  // the user had named one message earlier — and could not answer the question actually asked.
  it('says a note for the model about the source beside the data it already has', () => {
    const text = chatPrompt(record(), { ...WORKSPACE, sourceNote: 'They have not given you a source yet.' });
    expect(text).toContain('They have not given you a source yet.');
    expect(text).toContain('- revenue (number)');
    expect(text.indexOf('They have not given you a source yet.')).toBeLessThan(text.indexOf('- revenue (number)'));
  });

  // The model is told what the host measured rather than being asked to notice it itself, because a
  // spike described in the model's own words reads as an opinion and the same spike read twice reads as
  // two opinions.
  // The measures the user has already named, with the column and the reduction behind each: a model told
  // a name once and shown the column behind it stops inventing a third name for the same quantity.
  // The rules are ahead of the conversation and labelled, because a model told them in the first message
  // and then shown twelve turns that do not contain them has been given two sources of truth and no way
  // to tell which is current.
  it('carries the rules the user gave, ahead of the conversation', () => {
    const withRule = record({ instructions: ['always split by service'] });
    const text = chatPrompt(withRule, WORKSPACE);
    expect(text).toContain('## What the user has told you to keep doing');
    expect(text).toContain('- always split by service');
    expect(text.indexOf('## What the user has told you to keep doing')).toBeLessThan(text.indexOf('## So far'));
  });

  it('leaves the rules out entirely when there are none', () => {
    expect(chatPrompt(record(), WORKSPACE)).not.toContain('## What the user has told you');
    expect(chatPrompt(record({ instructions: [] }), WORKSPACE)).not.toContain('## What the user has told you');
  });

  it('lists the measures the user has named, with their column, reduction and synonyms', () => {
    const withMeasure = record({
      metrics: [{ name: 'p95 latency', y: 'revenue', aggregate: 'percentile', percentile: 95, synonyms: ['p95'] }],
    });
    const text = chatPrompt(withMeasure, WORKSPACE);
    expect(text).toContain('## The measures you know');
    expect(text).toContain('p95 latency: percentile 95 of revenue (also called p95)');
    expect(text.indexOf('## The measures you know')).toBeLessThan(text.indexOf('## So far'));
  });

  it('leaves out a measure this data does not have, rather than offering a name that cannot be drawn', () => {
    const withMeasure = record({ metrics: [{ name: 'p95 latency', y: 'nope', aggregate: 'sum' }] });
    expect(chatPrompt(withMeasure, WORKSPACE)).not.toContain('## The measures you know');
    expect(chatPrompt(record(), WORKSPACE)).not.toContain('## The measures you know');
  });

  it('shows the findings the host made about the data, and says who made them', () => {
    const text = chatPrompt(record(), { ...WORKSPACE, notices: ['In "Latency", north has a latency of 4200, outside the 98 to 103 that the middle half of the other 9 latency values occupies.'] });
    expect(text).toContain('## What the data is doing');
    expect(text).toContain('The host checked');
    expect(text).toContain('north has a latency of 4200');
    expect(text.indexOf('## What the data is doing')).toBeLessThan(text.indexOf('## So far'));
  });

  it('leaves the findings out entirely when there are none', () => {
    expect(chatPrompt(record(), { ...WORKSPACE, notices: [] })).not.toContain('## What the data is doing');
    expect(chatPrompt(record(), WORKSPACE)).not.toContain('## What the data is doing');
  });

  it('shows a visualization with no charts as having none', () => {
    expect(chatPrompt(record(), WORKSPACE)).toContain('There are no charts yet.');
  });
});

describe('the re-read prompt', () => {
  const chart = {
    id: 'c1',
    data: { kind: 'file' as const, path: 'data.json' },
    transforms: [],
    refreshSeconds: 30,
    table: TABLE,
    kind: 'bar' as const,
    x: 'region',
    y: 'revenue',
    title: 'Revenue by region',
  };

  it('asks for a file to be fetched again, into the same place, with the same specification', () => {
    const text = refreshPrompt(record({ charts: [chart] }), chart, WORKSPACE);
    expect(text).toContain('Fetch it again');
    expect(text).toContain('the same chart specification');
  });

  it('asks for nothing but the specification when the host will re-read the source itself', () => {
    const onSource = { ...chart, data: { kind: 'source' as const } };
    const text = refreshPrompt(record(), onSource, WORKSPACE);
    expect(text).toContain('the host re-reads the source');
  });
});

describe('parsing a reply', () => {
  const chart = { kind: 'bar', x: 'region', y: 'revenue', title: 'Revenue by region' };

  it('reads a complete reply', () => {
    const reply = parseReply(JSON.stringify({
      say: 'Here it is.', name: 'Regional revenue',
      charts: [{ ...chart, data: { kind: 'source' }, transforms: [] }],
      remove: ['old'], followUps: ['make it a line chart', '  ', 'split by year'],
    }));
    expect(reply?.say).toBe('Here it is.');
    expect(reply?.name).toBe('Regional revenue');
    expect(reply?.remove).toEqual(['old']);
    expect(reply?.followUps).toEqual(['make it a line chart', 'split by year']);
    expect(reply?.charts[0]).toMatchObject({ kind: 'bar', x: 'region', title: 'Revenue by region' });
  });

  it('reads a chart that changes only what it names', () => {
    const reply = parseReply(JSON.stringify({ charts: [{ id: 'c1', ...chart }] }));
    expect(reply?.charts[0]?.id).toBe('c1');
    expect(reply?.charts[0]?.data).toBeUndefined();
    expect(reply?.charts[0]?.transforms).toBeUndefined();
  });

  it('unwraps a fenced reply, which is the common case rather than the exception', () => {
    const reply = parseReply(['```json', JSON.stringify({ say: 'fenced' }), '```', 'And that is that.'].join('\n'));
    expect(reply?.say).toBe('fenced');
  });

  it('drops a chart it could not read rather than filling it in', () => {
    const reply = parseReply(JSON.stringify({ charts: [{ kind: 'bar', x: 'region' }, chart] }));
    expect(reply?.charts).toHaveLength(1);
    expect(reply?.charts[0]?.y).toBe('revenue');
  });

  it('drops a data reference and a transform list it could not read', () => {
    const reply = parseReply(JSON.stringify({
      charts: [{ ...chart, data: { kind: 'url' }, transforms: [{ op: 'pivot' }] }],
    }));
    expect(reply?.charts[0]?.data).toBeUndefined();
    expect(reply?.charts[0]?.transforms).toBeUndefined();
  });

  it('caps the suggestions at four and drops the blank ones', () => {
    const reply = parseReply(JSON.stringify({ followUps: ['a', ' ', 'b', '', 'c', 'd', 'e'] }));
    expect(reply?.followUps).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refuses prose, a bare list, and an object with nothing usable in it', () => {
    expect(parseReply('I would rather not answer in JSON.')).toBeUndefined();
    expect(parseReply('[1, 2, 3]')).toBeUndefined();
    expect(parseReply('{}')).toEqual({ say: '', charts: [], remove: [], notices: [], metrics: [], followUps: [] });
  });
});
