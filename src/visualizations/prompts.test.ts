import { describe, expect, it } from 'vitest';
import { chartPrompt, openingPrompt, parseChart, parseQuestions, revisionPrompt } from './prompts.js';
import type { Table } from './table.js';

const TABLE: Table = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
  ],
  rows: [['north', 10], ['south', 4]],
};

describe('openingPrompt', () => {
  it('names every column with its type, the row count, and a sample of the rows', () => {
    const prompt = openingPrompt('https://example.com/d.csv', TABLE);
    expect(prompt).toContain('- region (string)');
    expect(prompt).toContain('- revenue (number)');
    expect(prompt).toContain('Rows available: 2');
    expect(prompt).toContain('[["north",10],["south",4]]');
    expect(prompt).toContain('https://example.com/d.csv');
  });

  it('asks for questions and says the answer may be free text', () => {
    const prompt = openingPrompt('x', TABLE);
    expect(prompt).toContain('questions');
    expect(prompt).toContain('own words');
    expect(prompt).toContain('one JSON object');
  });
});

describe('chartPrompt', () => {
  it('carries the answered questions and the shape it wants back', () => {
    const prompt = chartPrompt(TABLE, [
      { question: 'Which measure?', answer: 'revenue' },
      { question: 'Split by?', answer: 'region' },
    ]);
    expect(prompt).toContain('Q: Which measure?\nA: revenue');
    expect(prompt).toContain('Q: Split by?\nA: region');
    expect(prompt).toContain('"kind"');
  });

  it('ignores an unanswered question rather than sending a blank answer', () => {
    const prompt = chartPrompt(TABLE, [
      { question: 'Which measure?', answer: 'revenue' },
      { question: 'Split by?' },
    ]);
    expect(prompt).toContain('Q: Which measure?');
    expect(prompt).not.toContain('Q: Split by?');
  });

  it('says so when there were no questions at all', () => {
    expect(chartPrompt(TABLE, [])).toContain('asked no questions');
  });

  // A field the prompt never names is a field the model never fills in, so the aggregate has to be in
  // the prose and in the example rather than left to be guessed at.
  it('names the aggregate, its values, and when to use one', () => {
    const prompt = chartPrompt(TABLE, []);
    expect(prompt).toContain('`aggregate` is optional');
    for (const aggregate of ['sum', 'mean', 'count', 'min', 'max']) {
      expect(prompt).toContain(`"${aggregate}"`);
    }
    expect(prompt).toContain('"aggregate":"sum"');
    expect(prompt).toContain('one row per transaction needs "sum"');
  });

  it('tells a revision to leave the aggregate alone unless the query is about it', () => {
    expect(revisionPrompt(TABLE, { kind: 'bar', x: 'a', y: 'b', title: 'T' }, 'make it a line'))
      .toContain('including the aggregate');
  });

  it('asks for follow-up questions in both chart prompts', () => {
    expect(chartPrompt(TABLE, [])).toContain('follow-up questions');
    expect(revisionPrompt(TABLE, { kind: 'bar', x: 'a', y: 'b', title: 'T' }, 'make it a line'))
      .toContain('follow-up questions');
  });

  // Without the set it already offered, a reply proposes from scratch and the same question comes back
  // after a change that answered it.
  it('carries the follow-ups it already offered into a revision', () => {
    const prompt = revisionPrompt(
      TABLE,
      { kind: 'bar', x: 'region', y: 'revenue', title: 'T' },
      'make it a line',
      ['split by region', '  ', 'show visits'],
    );
    expect(prompt).toContain('You already suggested these');
    expect(prompt).toContain('- split by region');
    expect(prompt).toContain('- show visits');
    expect(prompt).not.toContain('-   \n');
  });

  it('says nothing about earlier suggestions when there were none', () => {
    expect(revisionPrompt(TABLE, { kind: 'bar', x: 'a', y: 'b', title: 'T' }, 'make it a line', []))
      .not.toContain('You already suggested these');
  });
});

describe('revisionPrompt', () => {
  it('carries the query and the chart as it stands', () => {
    const prompt = revisionPrompt(TABLE, { kind: 'bar', x: 'region', y: 'revenue', title: 'T' }, 'make it a line');
    expect(prompt).toContain('make it a line');
    expect(prompt).toContain('"kind":"bar"');
    expect(prompt).toContain('answer it in `note`');
  });
});

describe('parseQuestions', () => {
  it('reads a bare JSON object and numbers the questions', () => {
    expect(parseQuestions('{"questions":[{"question":"Which measure?","suggestions":["revenue","visits"]}]}'))
      .toEqual([{ id: 'q1', question: 'Which measure?', suggestions: ['revenue', 'visits'] }]);
  });

  it('unwraps a fenced block and drops anything around it', () => {
    const reply = 'Here you go:\n```json\n{"questions":[{"question":"Q?","suggestions":[]}]}\n```\nHope that helps!';
    expect(parseQuestions(reply)).toEqual([{ id: 'q1', question: 'Q?', suggestions: [] }]);
  });

  it('drops an entry with no question, and an empty suggestion', () => {
    const reply = '{"questions":[{"question":"","suggestions":["a"]},{"question":"Q?","suggestions":["a","",3]}]}';
    expect(parseQuestions(reply)).toEqual([{ id: 'q1', question: 'Q?', suggestions: ['a'] }]);
  });

  it('refuses a reply that is not a JSON object, or carries no questions', () => {
    expect(parseQuestions('I am not sure what to ask.')).toBeUndefined();
    expect(parseQuestions('{"questions":[]}')).toBeUndefined();
    expect(parseQuestions('{"other":1}')).toBeUndefined();
  });
});

describe('parseChart', () => {
  it('reads a chart and its note', () => {
    expect(parseChart('{"kind":"line","x":"region","y":"revenue","title":"Revenue"}'))
      .toEqual({ chart: { kind: 'line', x: 'region', y: 'revenue', title: 'Revenue' }, note: '', followUps: [] });
    expect(parseChart('{"kind":"bar","x":"r","y":"v","title":"T","note":"here"}')?.note).toBe('here');
  });

  it('keeps a series column and axis labels when they are given, and drops empty ones', () => {
    expect(parseChart('{"kind":"bar","x":"r","y":"v","series":"g","title":"T","xLabel":"G","yLabel":""}'))
      .toEqual({ chart: { kind: 'bar', x: 'r', y: 'v', series: 'g', title: 'T', xLabel: 'G' }, note: '', followUps: [] });
  });

  it('refuses a chart naming a kind it does not draw, or missing a column or a title', () => {
    expect(parseChart('{"kind":"radar","x":"r","y":"v","title":"T"}')).toBeUndefined();
    expect(parseChart('{"kind":"bar","x":"r","title":"T"}')).toBeUndefined();
    expect(parseChart('{"kind":"bar","x":"r","y":"v","title":"  "}')).toBeUndefined();
  });

  it('refuses a reply that is not JSON, and one holding an array', () => {
    expect(parseChart('here is a bar chart of revenue')).toBeUndefined();
    expect(parseChart('[{"kind":"bar"}]')).toBeUndefined();
  });

  it('keeps an aggregate the grammar has, and leaves the field off when the reply omits it', () => {
    expect(parseChart('{"kind":"bar","x":"r","y":"v","aggregate":"sum","title":"T"}')?.chart)
      .toEqual({ kind: 'bar', x: 'r', y: 'v', aggregate: 'sum', title: 'T' });
    expect(parseChart('{"kind":"bar","x":"r","y":"v","title":"T"}')?.chart)
      .toEqual({ kind: 'bar', x: 'r', y: 'v', title: 'T' });
  });

  // Every other optional field on a chart is dropped when it is the wrong shape, because losing a label
  // costs a label. An aggregate dropped would leave a chart that draws successfully and means something
  // other than the model said, so it fails the whole specification the way an unknown kind does.
  it('refuses a whole chart naming an aggregate the grammar does not have', () => {
    expect(parseChart('{"kind":"bar","x":"r","y":"v","aggregate":"median","title":"T"}')).toBeUndefined();
    expect(parseChart('{"kind":"bar","x":"r","y":"v","aggregate":7,"title":"T"}')).toBeUndefined();
  });

  it('reads the follow-up questions the model offered with the chart', () => {
    expect(parseChart('{"kind":"bar","x":"r","y":"v","title":"T","followUps":["split by region","make it a line"]}')
      ?.followUps).toEqual(['split by region', 'make it a line']);
  });

  it('offers none when the model offers none, rather than an absent reply', () => {
    expect(parseChart('{"kind":"bar","x":"r","y":"v","title":"T"}')?.followUps).toEqual([]);
    expect(parseChart('{"kind":"bar","x":"r","y":"v","title":"T","followUps":"split by region"}')?.followUps)
      .toEqual([]);
  });

  // One bad entry should cost the model one button, not the whole row.
  it('drops a blank or non-string suggestion and keeps the rest', () => {
    expect(parseChart('{"kind":"bar","x":"r","y":"v","title":"T","followUps":["  keep me  ","",7,"  "]}')
      ?.followUps).toEqual(['keep me']);
  });

  it('shows no more suggestions than the interview would', () => {
    const many = Array.from({ length: 9 }, (_, index) => `"ask ${index}"`).join(',');
    expect(parseChart(`{"kind":"bar","x":"r","y":"v","title":"T","followUps":[${many}]}`)?.followUps)
      .toHaveLength(4);
  });
});
