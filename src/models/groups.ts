import type { ModelCatalog, ModelRecord } from './catalog-file.js';
import type { ModelCatalogMerge, ModelHarness, ModelRefreshOutcomes } from './merge.js';

export type GroupedModelRecord = { id: string; name: string; disabled?: boolean };
export type ModelGroup = { key: string; heading: string; records: GroupedModelRecord[] };

const OPEN_CODE_HEADINGS: Record<string, string> = {
  opencode: 'OpenCode Zen',
  'opencode-go': 'OpenCode Go',
  google: 'Google',
  openai: 'OpenAI',
};

export function groupModelCatalog(catalog: ModelCatalog): ModelGroup[] {
  const groups: ModelGroup[] = [];
  appendStandardGroup(groups, 'claude', 'Anthropic', catalog.claude ?? []);
  appendStandardGroup(groups, 'codex', 'OpenAI', catalog.codex ?? []);
  appendOpenCodeGroups(groups, catalog.opencode ?? []);
  return groups;
}

export function summarizeModelRefresh(
  merge: ModelCatalogMerge,
  outcomes: ModelRefreshOutcomes,
): string {
  const reached = reachedClauses(merge);
  const clauses = [
    ...(reached.length > 0 ? [`${reached.join(', ')}.`] : []),
    ...outcomeClauses(outcomes),
    ...unreportedPrefixClauses(merge.unreportedOpenCodePrefixes),
  ];
  const prefix = merge.reachedHarnesses.length > 0 ? 'Models refreshed:' : 'Models not refreshed:';
  return `${prefix}${clauses.length > 0 ? ` ${clauses.join(' ')}` : ''}`;
}

function appendStandardGroup(
  groups: ModelGroup[],
  key: 'claude' | 'codex',
  heading: string,
  records: ModelRecord[],
): void {
  appendVisibleGroup(groups, key, heading, records);
}

function appendOpenCodeGroups(groups: ModelGroup[], records: ModelRecord[]): void {
  const byPrefix = new Map<string, ModelRecord[]>();
  for (const record of records) {
    const prefix = openCodePrefix(record.id);
    const group = byPrefix.get(prefix) ?? [];
    group.push(record);
    byPrefix.set(prefix, group);
  }
  for (const [prefix, models] of byPrefix) {
    const heading = Object.hasOwn(OPEN_CODE_HEADINGS, prefix) ? OPEN_CODE_HEADINGS[prefix] : prefix;
    appendVisibleGroup(groups, `opencode:${prefix}`, heading, models);
  }
}

function appendVisibleGroup(
  groups: ModelGroup[],
  key: string,
  heading: string,
  records: ModelRecord[],
): void {
  const visible = records.filter(({ hidden }) => hidden !== true).map((record) => toGroupedRecord(record));
  if (visible.length > 0) groups.push({ key, heading, records: visible });
}

function toGroupedRecord(record: ModelRecord): GroupedModelRecord {
  return {
    id: record.id,
    name: record.name ?? record.id,
    ...(record.disabled !== undefined && { disabled: record.disabled }),
  };
}

function reachedClauses(merge: ModelCatalogMerge): string[] {
  return merge.reachedHarnesses.map((harness) => {
    const { visible, added, removed } = merge.counts[harness];
    const deltas = [added > 0 ? `+${added}` : '', removed > 0 ? `−${removed}` : ''].filter(Boolean);
    return `${harness} ${visible}${deltas.length > 0 ? ` (${deltas.join(' ')})` : ''}`;
  });
}

function outcomeClauses(outcomes: ModelRefreshOutcomes): string[] {
  const clauses: string[] = [];
  for (const harness of ['claude', 'codex', 'opencode'] as const satisfies ModelHarness[]) {
    const outcome = outcomes[harness];
    if (outcome.status !== 'ok') clauses.push(`${harness} ${outcome.status}: ${firstReasonLine(outcome.reason)}.`);
  }
  return clauses;
}

function unreportedPrefixClauses(prefixes: string[]): string[] {
  return prefixes.map((prefix) => `${prefix} skipped: not configured in opencode.`);
}

function firstReasonLine(reason: string): string {
  return reason.split(/\r?\n/u, 1)[0]?.trim().replace(/[.!?]+$/u, '') || 'provider request failed';
}

function openCodePrefix(id: string): string {
  const slash = id.indexOf('/');
  return slash === -1 ? 'opencode' : id.slice(0, slash);
}
