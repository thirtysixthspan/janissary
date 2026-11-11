import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { internalToolDenial } from './internal-tools.js';
import { CODEX_FEATURES_OFF, CODEX_TOOLS_OFF } from './internal-tools-test-fixture.js';

const acpSpec = readFileSync(new URL('../../product/specs/acp.md', import.meta.url), 'utf8');

const codexBase = { CODEX_CONFIG: JSON.stringify({ model: 'gpt-6-luna', model_reasoning_effort: 'high' }) };

describe('internalToolDenial', () => {
  it('merges a deny-all permission into opencode’s config beside its model', () => {
    const denial = internalToolDenial('opencode', { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: 'google/gemini' }) });

    expect(JSON.parse(denial?.env?.OPENCODE_CONFIG_CONTENT ?? '')).toEqual({ model: 'google/gemini', permission: 'deny' });
    expect(denial?.sessionMeta).toBeUndefined();
  });

  it('starts from an empty config when the base key is absent', () => {
    const denial = internalToolDenial('opencode', {});

    expect(JSON.parse(denial?.env?.OPENCODE_CONFIG_CONTENT ?? '')).toEqual({ permission: 'deny' });
  });

  it('says opencode keeps its built-in tools in the model’s list and denies every call', () => {
    const paragraph = acpSpec.split('\n').find((line) => line.includes('Role connections deny every internal tool'));
    expect(paragraph).toBeDefined();
    expect(paragraph).toContain("`opencode` keeps its built-in tools in the model's list and denies every call");
    expect(paragraph).not.toMatch(/`opencode`[^.]*never offered/u);
  });

  it('gives claude an empty session tool set and no environment', () => {
    expect(internalToolDenial('claude', { ANTHROPIC_MODEL: 'claude-haiku-4-5' }))
      .toEqual({ sessionMeta: { claudeCode: { options: { tools: [] } } } });
  });

  it('starts codex read-only with web search, its tool features, and its tool keys off', () => {
    const denial = internalToolDenial('codex', codexBase);

    expect(denial?.env?.INITIAL_AGENT_MODE).toBe('read-only');
    expect(JSON.parse(denial?.env?.CODEX_CONFIG ?? '')).toEqual({
      model: 'gpt-6-luna',
      model_reasoning_effort: 'high',
      web_search: 'disabled',
      features: CODEX_FEATURES_OFF,
      tools: CODEX_TOOLS_OFF,
    });
    expect(denial?.sessionMeta).toBeUndefined();
  });

  it('keeps a base codex features object’s own keys beside the disabled ones', () => {
    const base = { CODEX_CONFIG: JSON.stringify({ model: 'gpt-6-luna', features: { hooks: true } }) };
    const config: unknown = JSON.parse(internalToolDenial('codex', base)?.env?.CODEX_CONFIG ?? '');

    expect(config).toMatchObject({ features: { hooks: true, ...CODEX_FEATURES_OFF } });
  });

  it('never asks codex for `never` approval', () => {
    const denial = internalToolDenial('codex', codexBase);

    expect(JSON.parse(denial?.env?.CODEX_CONFIG ?? '')).not.toHaveProperty('approval_policy');
    expect(denial?.env?.INITIAL_AGENT_MODE).not.toBe('agent-full-access');
  });

  it('has no configuration for an unknown harness', () => {
    expect(internalToolDenial('gemini', {})).toBeUndefined();
  });
});
