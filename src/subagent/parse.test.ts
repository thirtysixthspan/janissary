import { describe, expect, it } from 'vitest';
import { parseSubagentCommand, SUBAGENT_FLAG_USAGE, SUBAGENT_JSON_USAGE } from './parse.js';

describe('usage exports', () => {
  it('exposes the exact usage lines', () => {
    expect(SUBAGENT_FLAG_USAGE).toBe('Usage: subagent --role <role> --task <file.md> [--context <text>]');
    expect(SUBAGENT_JSON_USAGE).toBe('Usage: subagent {"role":"<role>","task":"<file.md>","context":"<text>"}');
  });
});

describe('valid flag form', () => {
  it('parses the flags in any order after a case-insensitive token', () => {
    expect(parseSubagentCommand('subagent --role research --task tasks/x.md'))
      .toEqual({ form: 'flags', role: 'research', task: 'tasks/x.md' });
    expect(parseSubagentCommand('subagent --task tasks/x.md --role research'))
      .toEqual({ form: 'flags', role: 'research', task: 'tasks/x.md' });
    expect(parseSubagentCommand('  SUBAGENT   --role research --task tasks/x.md'))
      .toEqual({ form: 'flags', role: 'research', task: 'tasks/x.md' });
  });

  it('accepts an omitted or empty context', () => {
    expect(parseSubagentCommand('subagent --role r --task t.md'))
      .toEqual({ form: 'flags', role: 'r', task: 't.md' });
    expect(parseSubagentCommand('subagent --role r --task t.md --context "extra notes here"'))
      .toEqual({ form: 'flags', role: 'r', task: 't.md', context: 'extra notes here' });
    expect(parseSubagentCommand('subagent --role r --task t.md --context ""'))
      .toEqual({ form: 'flags', role: 'r', task: 't.md', context: '' });
  });

  it('preserves quoted values, escaped quotes and surrounding whitespace', () => {
    expect(parseSubagentCommand('subagent --role "code review" --task t.md'))
      .toEqual({ form: 'flags', role: 'code review', task: 't.md' });
    expect(parseSubagentCommand(String.raw`subagent --role "say \"hi\"" --task t.md`))
      .toEqual({ form: 'flags', role: 'say "hi"', task: 't.md' });
    expect(parseSubagentCommand('subagent --role "  padded  " --task t.md --context "  notes  "'))
      .toEqual({ form: 'flags', role: '  padded  ', task: 't.md', context: '  notes  ' });
  });
});

describe('valid JSON form', () => {
  it('parses the fields with an omitted or empty context', () => {
    expect(parseSubagentCommand('subagent {"role":"research","task":"t.md"}'))
      .toEqual({ form: 'json', role: 'research', task: 't.md' });
    expect(parseSubagentCommand('SubAgent {"role":"r","task":"t.md","context":"ctx"}'))
      .toEqual({ form: 'json', role: 'r', task: 't.md', context: 'ctx' });
    expect(parseSubagentCommand('subagent {"role":"r","task":"t.md","context":""}'))
      .toEqual({ form: 'json', role: 'r', task: 't.md', context: '' });
  });

  it('preserves string contents and escapes newlines', () => {
    expect(parseSubagentCommand('subagent {"role":"  padded  ","task":"t.md"}'))
      .toEqual({ form: 'json', role: '  padded  ', task: 't.md' });
    expect(parseSubagentCommand(String.raw`subagent {"role":"r","task":"t.md","context":"line1\nline2"}`))
      .toEqual({ form: 'json', role: 'r', task: 't.md', context: 'line1\nline2' });
  });
});

describe('form selection', () => {
  it('selects JSON when the trimmed argument starts with a brace', () => {
    expect(parseSubagentCommand('subagent   {"role":"r","task":"t.md"}'))
      .toEqual({ form: 'json', role: 'r', task: 't.md' });
  });

  it('sends arrays, scalars and quoted JSON down the flag branch', () => {
    for (const input of [
      'subagent ["role","task"]',
      'subagent 42',
      'subagent null',
      'subagent true',
      String.raw`subagent "{\"role\":\"r\"}"`,
    ]) {
      expect(parseSubagentCommand(input)).toEqual({ error: SUBAGENT_FLAG_USAGE });
    }
  });

  it('strips the command token only once', () => {
    expect(parseSubagentCommand('subagent subagent --role r --task t.md'))
      .toEqual({ error: SUBAGENT_FLAG_USAGE });
  });
});

describe('invalid input', () => {
  it('reports flag usage for bare input and every flag-form failure', () => {
    for (const input of [
      'subagent',
      'subagent --role research',
      'subagent --task t.md',
      'subagent --role research --task t.md --role other',
      'subagent --role research --task t.md --model x',
      'subagent --role research --task t.md --effort high',
      'subagent --role research --task t.md extra',
      'subagent --role research --task',
      'subagent --role "unfinished --task t.md',
      'subagent --role "   " --task t.md',
      'subagent --role r --task "   "',
      'subagent --Role r --task t.md',
      'subagent --role r --task t.md --context',
    ]) {
      expect(parseSubagentCommand(input)).toEqual({ error: SUBAGENT_FLAG_USAGE });
    }
  });

  it('reports JSON usage for every JSON-form failure', () => {
    for (const input of [
      'subagent {',
      'subagent {"role":"r","task":"t.md","model":"x"}',
      'subagent {"role":"r","task":"t.md","effort":"high"}',
      'subagent {"role":"r","task":"t.md","extra":1}',
      'subagent {"role":"r","task":123}',
      'subagent {"role":null,"task":"t.md"}',
      'subagent {"role":"r"}',
      'subagent {"task":"t.md"}',
      'subagent {"role":"  ","task":"t.md"}',
      'subagent {"role":"r","task":"  "}',
      'subagent {"role":"r","task":"t.md","context":5}',
      'subagent {"role":"r","task":"t.md","context":null}',
      'subagent {"role":"r","task":"t.md"} trailing',
    ]) {
      expect(parseSubagentCommand(input)).toEqual({ error: SUBAGENT_JSON_USAGE });
    }
  });
});
