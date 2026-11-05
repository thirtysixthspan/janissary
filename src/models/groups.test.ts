import { describe, expect, it } from 'vitest';
import type { ModelCatalog } from './catalog-file.js';
import { groupModelCatalog, summarizeModelRefresh } from './groups.js';
import { mergeModelCatalog, type ModelRefreshOutcomes } from './merge.js';

function outcomes(
  claude: ModelRefreshOutcomes['claude'],
  codex: ModelRefreshOutcomes['codex'],
  opencode: ModelRefreshOutcomes['opencode'],
): ModelRefreshOutcomes {
  return { claude, codex, opencode };
}

describe('groupModelCatalog', () => {
  it('orders groups, uses provider headings, hides hidden models, and keeps disabled/name fallbacks', () => {
    const catalog: ModelCatalog = {
      opencode: [
        { id: 'google/gemini' },
        { id: 'opencode-go/deepseek' },
        { id: 'custom/model', name: 'Custom model', disabled: true },
        { id: 'bare-model' },
        { id: 'other/hidden', hidden: true },
        { id: 'opencode/zen' },
        { id: 'openai/gpt', name: 'GPT', disabled: false },
      ],
      codex: [{ id: 'gpt-6-sol', name: 'GPT 6 Sol' }],
      claude: [{ id: 'claude-one', disabled: true }],
    };

    expect(groupModelCatalog(catalog)).toEqual([
      { key: 'claude', heading: 'Anthropic', records: [{ id: 'claude-one', name: 'claude-one', disabled: true }] },
      { key: 'codex', heading: 'OpenAI', records: [{ id: 'gpt-6-sol', name: 'GPT 6 Sol' }] },
      { key: 'opencode:google', heading: 'Google', records: [{ id: 'google/gemini', name: 'google/gemini' }] },
      { key: 'opencode:opencode-go', heading: 'OpenCode Go', records: [{ id: 'opencode-go/deepseek', name: 'opencode-go/deepseek' }] },
      { key: 'opencode:custom', heading: 'custom', records: [{ id: 'custom/model', name: 'Custom model', disabled: true }] },
      { key: 'opencode:opencode', heading: 'OpenCode Zen', records: [
        { id: 'bare-model', name: 'bare-model' },
        { id: 'opencode/zen', name: 'opencode/zen' },
      ] },
      { key: 'opencode:openai', heading: 'OpenAI', records: [{ id: 'openai/gpt', name: 'GPT', disabled: false }] },
    ]);
  });

  it('omits groups that contain only hidden models', () => {
    expect(groupModelCatalog({ claude: [{ id: 'hidden', hidden: true }], opencode: [] })).toEqual([]);
  });
});

describe('summarizeModelRefresh', () => {
  it('lists reached harnesses first with visible counts, nonzero deltas, then failures', () => {
    const merged = mergeModelCatalog({ claude: [{ id: 'old' }], codex: [], opencode: [{ id: 'google/old' }] }, outcomes(
      { status: 'ok', records: [{ id: 'new' }] },
      { status: 'ok', records: [] },
      { status: 'ok', records: [{ id: 'google/new' }] },
    ));
    const summary = summarizeModelRefresh(merged, outcomes(
      { status: 'ok', records: [{ id: 'new' }] },
      { status: 'ok', records: [] },
      { status: 'ok', records: [{ id: 'google/new' }] },
    ));
    expect(summary).toBe('Models refreshed: claude 1 (+1 −1), codex 0, opencode 1 (+1 −1).');
  });

  it('uses exact skip, failure, timeout, and unconfigured-prefix wording in order', () => {
    const fetchOutcomes = outcomes(
      { status: 'skipped', reason: 'ANTHROPIC_API_KEY is not set' },
      { status: 'failed', reason: 'timed out after 30 s\nprocess details' },
      { status: 'ok', records: [] },
    );
    const merged = mergeModelCatalog({ opencode: [{ id: 'google/model' }, { id: 'opencode-go/model' }] }, fetchOutcomes);
    expect(summarizeModelRefresh(merged, fetchOutcomes)).toBe(
      'Models not refreshed: claude skipped: ANTHROPIC_API_KEY is not set. '
      + 'codex failed: timed out after 30 s. google skipped: not configured in opencode. '
      + 'opencode-go skipped: not configured in opencode.',
    );
  });

  it('formats missing CLIs and does not mark OpenCode prefixes unconfigured after failure', () => {
    const fetchOutcomes = outcomes(
      { status: 'skipped', reason: 'claude is not installed' },
      { status: 'skipped', reason: 'codex is not installed' },
      { status: 'skipped', reason: 'opencode is not installed' },
    );
    const merged = mergeModelCatalog({ opencode: [{ id: 'google/model' }] }, fetchOutcomes);
    expect(summarizeModelRefresh(merged, fetchOutcomes)).toBe(
      'Models not refreshed: claude skipped: claude is not installed. '
      + 'codex skipped: codex is not installed. opencode skipped: opencode is not installed.',
    );
  });

  it('puts reached counts before first-line failures and skipped providers', () => {
    const fetchOutcomes = outcomes(
      { status: 'ok', records: [] },
      { status: 'failed', reason: 'invalid codex response.\nextra details' },
      { status: 'skipped', reason: 'opencode is not installed' },
    );
    const merged = mergeModelCatalog({ claude: [] }, fetchOutcomes);
    expect(summarizeModelRefresh(merged, fetchOutcomes)).toBe(
      'Models refreshed: claude 0. codex failed: invalid codex response. opencode skipped: opencode is not installed.',
    );
  });
});
