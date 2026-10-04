import { describe, it, expect } from 'vitest';
import { AGENT_MODEL_USAGE, parseAgentCommand, resolveAgentName } from './commands.js';

describe('parseAgentCommand — --model', () => {
  it('takes a space-separated value and keeps it out of the tab name', () => {
    const parsed = parseAgentCommand('agent scout --model google/gemini-3.1-pro');
    expect(parsed.name).toBe('scout');
    expect(parsed.model).toBe('google/gemini-3.1-pro');
    expect(parsed.modelError).toBeUndefined();
  });

  it('takes an inline value', () => {
    const parsed = parseAgentCommand('agent scout --model=google/gemini-3.1-pro');
    expect(parsed.name).toBe('scout');
    expect(parsed.model).toBe('google/gemini-3.1-pro');
  });

  it('accepts the flag before the name', () => {
    const parsed = parseAgentCommand('agent --model anthropic/claude-sonnet-4 scout');
    expect(parsed.name).toBe('scout');
    expect(parsed.model).toBe('anthropic/claude-sonnet-4');
  });

  it('accepts the flag after an on <address> clause', () => {
    const parsed = parseAgentCommand('agent scout on devbox --model anthropic/claude-sonnet-4');
    expect(parsed.name).toBe('scout');
    expect(parsed.remote?.host).toBe('devbox');
    expect(parsed.model).toBe('anthropic/claude-sonnet-4');
  });

  it('reports a usage error for a valueless --model', () => {
    expect(parseAgentCommand('agent scout --model').modelError).toBe(AGENT_MODEL_USAGE);
    expect(parseAgentCommand('agent scout --model=').modelError).toBe(AGENT_MODEL_USAGE);
  });

  it('takes a following flag as the value, leaving the catalog check to refuse it', () => {
    const parsed = parseAgentCommand('agent scout --model --offline');
    expect(parsed.model).toBe('--offline');
    expect(parsed.offline).toBe(false);
  });

  it('leaves the model unset when the flag is absent', () => {
    const parsed = parseAgentCommand('agent scout');
    expect(parsed.model).toBeUndefined();
    expect(parsed.modelError).toBeUndefined();
  });

  it('combines with the existing flags', () => {
    const parsed = parseAgentCommand('agent --no-workspace --offline scout --model google/gemini-3.1-pro');
    expect(parsed.workspace).toBe(false);
    expect(parsed.offline).toBe(true);
    expect(parsed.name).toBe('scout');
    expect(parsed.model).toBe('google/gemini-3.1-pro');
  });
});

describe('resolveAgentName with --model', () => {
  it('resolves the typed name without the flag', () => {
    expect(resolveAgentName('agent scout --model google/gemini-3.1-pro', [])).toBe('scout');
  });

  it('resolves the typed name with an inline flag value', () => {
    expect(resolveAgentName('agent --model=google/gemini-3.1-pro scout', [])).toBe('scout');
  });
});