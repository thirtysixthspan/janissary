import { describe, expect, it } from 'vitest';
import { parseAgentCommand } from './command-parser.js';

describe('parseAgentCommand', () => {
  it('parses clauses in any order, quotes, and the untouched parameter tail', () => {
    expect(parseAgentCommand('agent with effort high with skill "ask user" on "build host" using model gpt-5 in workspace "Existing workspace" in group "Build Team" in a tab execute tasks/run.md --flag "some text"'))
      .toEqual({
        host: 'build host',
        inTab: true,
        group: 'Build Team',
        workspace: 'Existing workspace',
        model: 'gpt-5',
        effort: 'high',
        skills: ['ask user'],
        task: 'tasks/run.md',
        parameters: ' --flag "some text"',
      });
  });

  it('accepts group-only headless selection and deduplicates repeated skills', () => {
    expect(parseAgentCommand('in group ops with skill ask-user with skill ask-user execute task.md'))
      .toMatchObject({ inTab: false, group: 'ops', skills: ['ask-user'] });
  });

  it('requires execute as the final launch clause and a task', () => {
    expect(parseAgentCommand('in a tab')).toEqual({ error: 'Agent: missing execute clause.' });
    expect(parseAgentCommand('execute')).toEqual({ error: 'Agent: missing task after execute.' });
    expect(parseAgentCommand('execute task.md in a tab')).toMatchObject({ task: 'task.md', parameters: ' in a tab' });
  });

  it('preserves unmatched quotes and significant whitespace in the task parameter tail', () => {
    expect(parseAgentCommand('execute task.md   --value  "unfinished'))
      .toMatchObject({ task: 'task.md', parameters: '   --value  "unfinished' });
    expect(parseAgentCommand('execute task.md "unfinished'))
      .toMatchObject({ task: 'task.md', parameters: ' "unfinished' });
  });

  it('rejects duplicate singleton clauses and malformed or missing values', () => {
    expect(parseAgentCommand('in a tab in a tab execute task.md')).toEqual({ error: 'Agent: duplicate clause "in a tab".' });
    expect(parseAgentCommand('using model a using model b execute task.md')).toEqual({ error: 'Agent: duplicate clause "using model".' });
    expect(parseAgentCommand('with skill execute task.md')).toEqual({ error: 'Agent: missing value for with skill.' });
    expect(parseAgentCommand('with skill "unfinished execute task.md')).toEqual({ error: 'Agent: malformed quoted value.' });
    expect(parseAgentCommand('execute "unfinished')).toEqual({ error: 'Agent: malformed quoted value.' });
  });

  it('rejects duplicates for every singleton launch clause', () => {
    for (const invocation of [
      'on first on second execute task.md',
      'in group first in group second execute task.md',
      'in workspace first in workspace second execute task.md',
      'with effort low with effort high execute task.md',
    ]) {
      expect(parseAgentCommand(invocation)).toHaveProperty('error', expect.stringContaining('duplicate clause'));
    }
  });

  it('reports the exact parser error for every invalid launch-clause form', () => {
    for (const [invocation, error] of [
      ['on execute task.md', 'Agent: missing value for on.'],
      ['with', 'Agent: missing value for with.'],
      ['using', 'Agent: missing value for using.'],
      ['with skill execute task.md', 'Agent: missing value for with skill.'],
      ['with effort execute task.md', 'Agent: missing value for with effort.'],
      ['using model execute task.md', 'Agent: missing value for using model.'],
      ['in', 'Agent: missing value for in .'],
      ['in a execute task.md', 'Agent: missing value for in a.'],
      ['in group execute task.md', 'Agent: missing value for in group.'],
      ['with color red execute task.md', 'Agent: unknown clause "with color".'],
      ['with "" color execute task.md', 'Agent: unknown clause "with ".'],
      ['using color red execute task.md', 'Agent: unknown clause "using color".'],
      ['using "" color execute task.md', 'Agent: unknown clause "using ".'],
      ['in room lounge execute task.md', 'Agent: unknown clause "in room".'],
      ['in "" room execute task.md', 'Agent: unknown clause "in ".'],
      ['in execute task.md', 'Agent: unknown clause "in execute".'],
      ['on first on second execute task.md', 'Agent: duplicate clause "on".'],
      ['in a tab in a tab execute task.md', 'Agent: duplicate clause "in a tab".'],
      ['in group first in group second execute task.md', 'Agent: duplicate clause "in group".'],
      ['in workspace first in workspace second execute task.md', 'Agent: duplicate clause "in workspace".'],
      ['using model first using model second execute task.md', 'Agent: duplicate clause "using model".'],
      ['with effort low with effort high execute task.md', 'Agent: duplicate clause "with effort".'],
      ['launch execute task.md', 'Agent: expected launch clause or final execute, got "launch".'],
      ['"" execute task.md', 'Agent: expected launch clause or final execute, got "".'],
      ['in a tab', 'Agent: missing execute clause.'],
      ['execute', 'Agent: missing task after execute.'],
      ['execute ""', 'Agent: missing task after execute.'],
    ] as const) {
      expect(parseAgentCommand(invocation)).toEqual({ error });
    }
  });
});
