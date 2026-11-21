import { describe, expect, it } from 'vitest';
import { isSubagentCommandLine, subagentTaskPrompt, SUBAGENT_PRIMER } from './primer.js';

describe('isSubagentCommandLine', () => {
  it('accepts a bare or suffixed case-insensitive subagent token', () => {
    expect(isSubagentCommandLine('subagent')).toBe(true);
    expect(isSubagentCommandLine('SUBAGENT --role r --task t.md')).toBe(true);
    expect(isSubagentCommandLine('  subagent   --task t.md')).toBe(true);
    expect(isSubagentCommandLine('subagent {malformed json')).toBe(true);
    expect(isSubagentCommandLine('subagent\t{"role":"r"}')).toBe(true);
  });

  it('rejects lookalikes and other first tokens', () => {
    for (const line of ['subagents', 'subagent-foo', 'agent --role r', 'tell subagent', '', ' '.repeat(3)]) {
      expect(isSubagentCommandLine(line)).toBe(false);
    }
  });
});

describe('SUBAGENT_PRIMER', () => {
  const primer = SUBAGENT_PRIMER.toLowerCase();

  it('teaches the one-line JSON grammar with escaped newlines', () => {
    expect(primer).toContain('one line of json');
    for (const field of ['"role"', '"task"', '"context"']) {
      expect(primer).toContain(field);
    }
    expect(primer).toContain('newlines');
    expect(SUBAGENT_PRIMER).toContain(String.raw`\n`);
  });

  it('teaches that the task is optional when the context carries the assignment', () => {
    expect(primer).toContain('optional "task"');
    expect(primer).toContain('omit "task"');
    expect(primer).toContain('carries the whole assignment');
  });

  it('teaches empty immediate output and later JSON prompts', () => {
    expect(primer).toContain('no output immediately');
    expect(primer).toContain('does not block you');
    expect(primer).toContain('arrive later');
    expect(primer).toContain('one json object on a single line');
  });

  it('documents the started message fields and meaning', () => {
    expect(primer).toContain('"status":"started"');
    for (const field of ['"role"', '"sessionid"', '"callerid"']) {
      expect(primer).toContain(field);
    }
    expect(primer).toContain('canonical role name');
    expect(primer).toContain('running in the background');
  });

  it('documents completion fields, ids and timing rules', () => {
    for (const field of ['"status"', '"sessionid"', '"callerid"', '"output"']) {
      expect(primer).toContain(field);
    }
    expect(primer).toContain('provider session id');
    expect(primer).toContain('may be null');
    expect(primer).toContain('may be skipped');
    expect(primer).toContain('overtakes');
  });

  it('explains every completion status', () => {
    for (const status of ['"completed"', '"partial"', '"failed"', '"terminated"']) {
      expect(primer).toContain(status);
    }
    expect(primer).toContain('finished successfully');
    expect(primer).toContain('tool-loop limit');
    expect(primer).toContain('source error');
    expect(primer).toContain('it was stopped');
  });

  it('lists no roles and reads no role descriptions', () => {
    for (const name of ['research', 'code review', 'implementation', 'documentation']) {
      expect(primer).not.toContain(name);
    }
    expect(primer).toContain('no role list');
  });

  it('shows a fenced example of the JSON form', () => {
    expect(primer.split('\n').slice(-3)).toEqual([
      '```janissary',
      'subagent {"role":"scout","context":"investigate the parser"}',
      '```',
    ]);
  });
});

describe('subagentTaskPrompt', () => {
  it('orders the lead-in, task text and context verbatim', () => {
    const prompt = subagentTaskPrompt('TASK BODY', 'EXTRA CONTEXT');
    expect(prompt.indexOf('You are a subagent')).toBeLessThan(prompt.indexOf('TASK BODY'));
    expect(prompt.indexOf('TASK BODY')).toBeLessThan(prompt.indexOf('EXTRA CONTEXT'));
    expect(prompt).toContain('self-contained final result');
    expect(prompt).toContain('TASK BODY');
    expect(prompt).toContain('EXTRA CONTEXT');
  });

  it('teaches the final result delimiter contract', () => {
    const prompt = subagentTaskPrompt('TASK BODY');
    expect(prompt).toContain('<final_result>');
    expect(prompt).toContain('</final_result>');
    expect(prompt).toContain('Keep reasoning, thoughts, and tool calls outside the tags');
    expect(prompt).toContain('The tags and everything outside them are discarded');
    expect(prompt.indexOf('Write only that final result')).toBeLessThan(prompt.indexOf('TASK BODY'));
  });

  it('omits context when none is supplied', () => {
    expect(subagentTaskPrompt('TASK BODY')).toBe(
      'You are a subagent. Complete the task below and finish with a self-contained final result for the agent that launched you.\n\n'
      + 'Write only that final result between <final_result> and </final_result> tags. Keep reasoning, thoughts, and tool calls outside the tags, and write nothing after the closing tag. The tags and everything outside them are discarded; only the contents reach the caller.\n\n'
      + 'TASK BODY',
    );
  });

  it('places an inline assignment verbatim and only once', () => {
    const prompt = subagentTaskPrompt('Investigate the parser');
    expect(prompt).toContain('Investigate the parser');
    expect(prompt.match(/Investigate the parser/g)).toHaveLength(1);
  });

  it('does not repeat the command primer', () => {
    expect(subagentTaskPrompt('TASK BODY', 'EXTRA')).not.toContain('How commands work');
  });
});
