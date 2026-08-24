import { describe, it, expect } from 'vitest';
import { parseHarnessCommand } from './command-parse.js';

// The helpers (findFlagValue, splitWithClause, parseHarnessFlags, parseLabelSubcommand) are
// module-private, so every branch is reached through the exported entry point.

describe('parseHarnessCommand — launch form', () => {
  it('parses a bare harness name with all flags off', () => {
    expect(parseHarnessCommand('harness claude')).toEqual({
      name: 'claude',
      workspace: false,
      offline: false,
      autoApprove: false,
    });
  });

  it('accepts both spellings of the workspace flag', () => {
    expect(parseHarnessCommand('harness claude -w')).toMatchObject({ workspace: true });
    expect(parseHarnessCommand('harness claude --workspace')).toMatchObject({ workspace: true });
  });

  it('accepts both spellings of the auto-approve flag', () => {
    expect(parseHarnessCommand('harness claude -y')).toMatchObject({ autoApprove: true });
    expect(parseHarnessCommand('harness codex --yes')).toMatchObject({ autoApprove: true });
  });

  it('parses --offline', () => {
    expect(parseHarnessCommand('harness claude -w --offline')).toMatchObject({ workspace: true, offline: true });
  });

  it('lower-cases the harness name', () => {
    expect(parseHarnessCommand('harness CLAUDE')).toMatchObject({ name: 'claude' });
  });

  it('parses --model and --effort values', () => {
    expect(parseHarnessCommand('harness claude --model opus --effort high')).toMatchObject({
      model: 'opus',
      effort: 'high',
    });
  });

  it('parses a trailing as <label>', () => {
    expect(parseHarnessCommand('harness claude as reviewer')).toMatchObject({ label: 'reviewer' });
  });

  it('parses every option together, in any order', () => {
    expect(parseHarnessCommand('harness codex --effort low as bot -y --offline --model gpt-5 -w')).toEqual({
      name: 'codex',
      workspace: true,
      offline: true,
      autoApprove: true,
      model: 'gpt-5',
      effort: 'low',
      label: 'bot',
    });
  });
});

describe('parseHarnessCommand — with <prompt> clause', () => {
  it('captures the prompt and keeps it out of option parsing', () => {
    expect(parseHarnessCommand('harness claude with fix the -w flag')).toEqual({
      name: 'claude',
      workspace: false,
      offline: false,
      autoApprove: false,
      prompt: 'fix the -w flag',
    });
  });

  it('preserves internal spacing in the prompt verbatim', () => {
    expect(parseHarnessCommand('harness claude with  keep   these   spaces')).toMatchObject({
      prompt: 'keep   these   spaces',
    });
  });

  it('parses options to the left of the clause', () => {
    expect(parseHarnessCommand('harness claude -w as bot with run the tests')).toMatchObject({
      workspace: true,
      label: 'bot',
      prompt: 'run the tests',
    });
  });

  it('does not treat a with-prefixed word as the clause keyword', () => {
    expect(parseHarnessCommand('harness claude as without')).toMatchObject({ label: 'without', prompt: undefined });
  });
});

describe('parseHarnessCommand — capture and transcript subcommands', () => {
  it('parses capture <label>', () => {
    expect(parseHarnessCommand('harness capture reviewer')).toEqual({ capture: true, label: 'reviewer' });
  });

  it('parses transcript <label>', () => {
    expect(parseHarnessCommand('harness transcript reviewer')).toEqual({ transcript: true, label: 'reviewer' });
  });

  it('is case-insensitive on the subcommand keyword', () => {
    expect(parseHarnessCommand('harness CAPTURE bot')).toEqual({ capture: true, label: 'bot' });
  });
});

describe('parseHarnessCommand — error paths', () => {
  it('errors on a bare harness command', () => {
    expect(parseHarnessCommand('harness')).toEqual({ error: expect.stringContaining('Usage: harness') });
  });

  it('errors on an unknown harness name', () => {
    expect(parseHarnessCommand('harness bogus')).toEqual({
      error: expect.stringContaining('Unknown harness "bogus"'),
    });
  });

  it('errors when auto-approve is asked of an unsupported harness', () => {
    expect(parseHarnessCommand('harness opencode -y')).toEqual({
      error: '-y/--yes is only supported for the claude and codex harnesses.',
    });
  });

  it('errors when --model has no value', () => {
    expect(parseHarnessCommand('harness claude --model')).toEqual({
      error: expect.stringContaining('--model <value>'),
    });
  });

  it('errors when --effort has no value', () => {
    expect(parseHarnessCommand('harness claude --effort')).toEqual({
      error: expect.stringContaining('--effort <value>'),
    });
  });

  it('errors when as has no label', () => {
    expect(parseHarnessCommand('harness claude as')).toEqual({
      error: expect.stringContaining('as <label>'),
    });
  });

  it('errors when with has no prompt', () => {
    expect(parseHarnessCommand('harness claude with')).toEqual({
      error: expect.stringContaining('with <prompt>'),
    });
  });

  it('errors when the clause leaves no harness name', () => {
    expect(parseHarnessCommand('harness with do something')).toEqual({
      error: expect.stringContaining('Unknown harness'),
    });
  });

  it('errors when capture has no label', () => {
    expect(parseHarnessCommand('harness capture')).toEqual({ error: 'Usage: harness capture <name>.' });
  });

  it('errors when transcript has no label', () => {
    expect(parseHarnessCommand('harness transcript')).toEqual({ error: 'Usage: harness transcript <name>.' });
  });
});
