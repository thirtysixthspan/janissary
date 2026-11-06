import { describe, expect, it } from 'vitest';
import type { ModelCatalog } from './catalog-file.js';
import { mergeModelCatalog, type ModelRefreshOutcomes } from './merge.js';

function outcomes(
  claude: ModelRefreshOutcomes['claude'],
  codex: ModelRefreshOutcomes['codex'],
  opencode: ModelRefreshOutcomes['opencode'],
): ModelRefreshOutcomes {
  return { claude, codex, opencode };
}

describe('mergeModelCatalog', () => {
  it('syncs reached harnesses, keeps flags, clears absent names, and reports deltas', () => {
    const original: ModelCatalog = {
      claude: [
        { id: 'claude-old', name: 'Old name', disabled: true, hidden: true },
        { id: 'claude-gone' },
      ],
      codex: [{ id: 'gpt-old', name: 'Stored', hidden: true }],
    };
    const result = mergeModelCatalog(original, outcomes(
      { status: 'ok', records: [{ id: 'claude-old' }, { id: 'claude-new', name: 'New' }] },
      { status: 'ok', records: [{ id: 'gpt-old', name: 'Fetched' }] },
      { status: 'skipped', reason: 'opencode is not installed' },
    ));

    expect(result.catalog).toEqual({
      claude: [
        { id: 'claude-old', disabled: true, hidden: true },
        { id: 'claude-new', name: 'New' },
      ],
      codex: [{ id: 'gpt-old', name: 'Fetched', hidden: true }],
    });
    expect(result.counts).toEqual({
      claude: { visible: 1, added: 1, removed: 1 },
      codex: { visible: 0, added: 0, removed: 0 },
      opencode: { visible: 0, added: 0, removed: 0 },
    });
    expect(result.reachedHarnesses).toEqual(['claude', 'codex']);
    expect(result.catalog).not.toBe(original);
    expect(original.claude?.[0]).toMatchObject({ name: 'Old name' });
  });

  it('syncs reported OpenCode prefixes and appends additions after existing records', () => {
    const original: ModelCatalog = {
      opencode: [
        { id: 'opencode/kept', hidden: true },
        { id: 'google/kept', name: 'Google kept' },
        { id: 'openai/kept', name: 'Old name', disabled: true },
        { id: 'openai/gone' },
      ],
    };
    const result = mergeModelCatalog(original, outcomes(
      { status: 'failed', reason: 'offline' },
      { status: 'failed', reason: 'offline' },
      { status: 'ok', records: [
        { id: 'openai/kept', name: 'New name' },
        { id: 'new-provider/first' },
        { id: 'openai/added', name: 'Added' },
      ] },
    ));

    expect(result.catalog.opencode).toEqual([
      { id: 'opencode/kept', hidden: true },
      { id: 'google/kept', name: 'Google kept' },
      { id: 'openai/kept', name: 'New name', disabled: true },
      { id: 'new-provider/first' },
      { id: 'openai/added', name: 'Added' },
    ]);
    expect(result.counts.opencode).toEqual({ visible: 4, added: 2, removed: 1 });
    expect(result.reachedHarnesses).toEqual(['opencode']);
    expect(result.unreportedOpenCodePrefixes).toEqual(['opencode', 'google']);
  });

  it('keeps all prefixes on a successful empty OpenCode result without reaching that harness', () => {
    const catalog: ModelCatalog = { opencode: [{ id: 'google/model' }, { id: 'bare-model' }] };
    const result = mergeModelCatalog(catalog, outcomes(
      { status: 'failed', reason: 'failed' },
      { status: 'failed', reason: 'failed' },
      { status: 'ok', records: [] },
    ));

    expect(result.catalog.opencode).toBe(catalog.opencode);
    expect(result.counts.opencode).toEqual({ visible: 2, added: 0, removed: 0 });
    expect(result.reachedHarnesses).toEqual([]);
    expect(result.unreportedOpenCodePrefixes).toEqual(['google', 'opencode']);
  });

  it('does not mark prefixes unconfigured when the OpenCode command did not succeed', () => {
    const result = mergeModelCatalog({ opencode: [{ id: 'google/model' }] }, outcomes(
      { status: 'failed', reason: 'failed' },
      { status: 'failed', reason: 'failed' },
      { status: 'failed', reason: 'command failed' },
    ));
    expect(result.catalog.opencode).toEqual([{ id: 'google/model' }]);
    expect(result.unreportedOpenCodePrefixes).toEqual([]);
    expect(result.reachedHarnesses).toEqual([]);
  });
});
