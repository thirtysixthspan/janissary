import { describe, expect, it } from 'vitest';
import { parseMonitorCommand, parseUnmonitorCommand, parseSuggestion } from './parsing.js';

describe('parseMonitorCommand', () => {
  it('parses inline mode (persona only, no targets)', () => {
    expect(parseMonitorCommand('monitor security')).toEqual({ persona: 'security', targets: [] });
  });

  it('parses tab and group targets', () => {
    expect(parseMonitorCommand('monitor assistant agent2 group:2')).toEqual({
      persona: 'assistant',
      targets: [{ kind: 'tab', label: 'agent2' }, { kind: 'group', group: 2 }],
    });
  });

  it('rejects a missing persona', () => {
    expect(parseMonitorCommand('monitor')).toHaveProperty('error');
  });

  it('rejects a malformed target', () => {
    expect(parseMonitorCommand('monitor security group:abc')).toHaveProperty('error');
  });

  it('parses ask with the question joined back together', () => {
    expect(parseMonitorCommand('monitor ask security what have you seen so far?')).toEqual({
      ask: true, persona: 'security', question: 'what have you seen so far?',
    });
  });

  it('hints when ask is given in the wrong position', () => {
    expect(parseMonitorCommand('monitor assistant ask what is up?')).toEqual({
      error: 'Did you mean: monitor ask assistant <question>?',
    });
  });

  it('rejects ask without a persona or question', () => {
    expect(parseMonitorCommand('monitor ask')).toHaveProperty('error');
    expect(parseMonitorCommand('monitor ask security')).toHaveProperty('error');
  });
});

describe('parseUnmonitorCommand', () => {
  it('parses --all', () => {
    expect(parseUnmonitorCommand('unmonitor --all')).toEqual({ all: true });
  });

  it('parses a persona alone', () => {
    expect(parseUnmonitorCommand('unmonitor security')).toEqual({ persona: 'security' });
  });

  it('parses a persona plus one target', () => {
    expect(parseUnmonitorCommand('unmonitor assistant group:3')).toEqual({
      persona: 'assistant',
      target: { kind: 'group', group: 3 },
    });
  });

  it('rejects a bare unmonitor', () => {
    expect(parseUnmonitorCommand('unmonitor')).toHaveProperty('error');
  });
});

describe('parseSuggestion', () => {
  it('extracts suggestion and command markers', () => {
    const reply = 'Some preamble\n[SUGGESTION]: Check the build output\n[COMMAND]: npm run build\n';
    expect(parseSuggestion(reply)).toEqual({ text: 'Check the build output', command: 'npm run build' });
  });

  it('extracts a suggestion without a command', () => {
    expect(parseSuggestion('[SUGGESTION]: Take a closer look at that diff')).toEqual({ text: 'Take a closer look at that diff' });
  });

  it('extracts a summary as text with no command', () => {
    expect(parseSuggestion('[SUMMARY]: The agent is running the test suite and fixing a failing case.'))
      .toEqual({ text: 'The agent is running the test suite and fixing a failing case.' });
  });

  it('prefers an actionable suggestion over a summary when both are present', () => {
    const reply = '[SUMMARY]: The build is failing.\n[SUGGESTION]: Rerun the build\n[COMMAND]: npm run build';
    expect(parseSuggestion(reply)).toEqual({ text: 'Rerun the build', command: 'npm run build' });
  });

  it('returns null when no marker is present', () => {
    expect(parseSuggestion('OK')).toBeNull();
    expect(parseSuggestion('I have nothing to add here.')).toBeNull();
  });

  it('captures a summary that spans multiple lines', () => {
    const reply = [
      '[SUMMARY]: Two parallel feature implementations underway:',
      '- **claude** (Opus): implementing git modified coloring for file navigator (mid-thought, has context ready)',
      '- **claude-2** (Sonnet): just started executing `build-a-feature.md` for **acp-rate-limit-notification** — reading the task file now',
    ].join('\n');
    expect(parseSuggestion(reply)).toEqual({ text: reply.replace('[SUMMARY]: ', '') });
  });

  it('captures a multi-line suggestion without swallowing its own command line', () => {
    const reply = [
      '[SUGGESTION]: Rerun the build, it failed on:',
      '- a flaky network timeout',
      '[COMMAND]: npm run build',
    ].join('\n');
    expect(parseSuggestion(reply)).toEqual({
      text: 'Rerun the build, it failed on:\n- a flaky network timeout',
      command: 'npm run build',
    });
  });
});
