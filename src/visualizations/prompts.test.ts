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
      .toEqual({ chart: { kind: 'line', x: 'region', y: 'revenue', title: 'Revenue' }, note: '' });
    expect(parseChart('{"kind":"bar","x":"r","y":"v","title":"T","note":"here"}')?.note).toBe('here');
  });

  it('keeps a series column and axis labels when they are given, and drops empty ones', () => {
    expect(parseChart('{"kind":"bar","x":"r","y":"v","series":"g","title":"T","xLabel":"G","yLabel":""}'))
      .toEqual({ chart: { kind: 'bar', x: 'r', y: 'v', series: 'g', title: 'T', xLabel: 'G' }, note: '' });
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
});
