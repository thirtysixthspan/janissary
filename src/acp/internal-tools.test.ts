import { describe, expect, it } from 'vitest';
import { internalToolDenial } from './internal-tools.js';

const CODEX_FEATURES_OFF = {
  shell_tool: false,
  unified_exec: false,
  view_image: false,
  image_generation: false,
  multi_agent: false,
  apps: false,
  goals: false,
  tool_suggest: false,
  multi_agent_v2: false,
  code_mode: false,
  request_permissions_tool: false,
  standalone_web_search: false,
};

const CODEX_TOOLS_OFF = { update_plan: { enabled: false }, experimental_request_user_input: { enabled: false } };

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
