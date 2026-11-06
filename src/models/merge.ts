import type { ModelCatalog, ModelRecord } from './catalog-file.js';
import type { ProviderOutcome, ProviderRecord } from './providers/result.js';

export type ModelHarness = 'claude' | 'codex' | 'opencode';
export type ModelRefreshOutcomes = Record<ModelHarness, ProviderOutcome>;
export type ModelRefreshCounts = Record<ModelHarness, { visible: number; added: number; removed: number }>;

export type ModelCatalogMerge = {
  catalog: ModelCatalog;
  counts: ModelRefreshCounts;
  reachedHarnesses: ModelHarness[];
  unreportedOpenCodePrefixes: string[];
};

export function mergeModelCatalog(
  catalog: ModelCatalog,
  outcomes: ModelRefreshOutcomes,
): ModelCatalogMerge {
  const merged: ModelCatalog = { ...catalog };
  const counts: ModelRefreshCounts = {
    claude: { visible: 0, added: 0, removed: 0 },
    codex: { visible: 0, added: 0, removed: 0 },
    opencode: { visible: 0, added: 0, removed: 0 },
  };
  const reachedHarnesses: ModelHarness[] = [];

  for (const harness of ['claude', 'codex'] as const) {
    const outcome = outcomes[harness];
    if (outcome.status !== 'ok') continue;
    const result = mergeRecords(catalog[harness] ?? [], outcome.records);
    merged[harness] = result.records;
    counts[harness] = {
      visible: visibleCount(result.records),
      added: result.added,
      removed: result.removed,
    };
    reachedHarnesses.push(harness);
  }
  for (const harness of ['claude', 'codex'] as const) {
    counts[harness].visible = visibleCount(merged[harness] ?? []);
  }

  const openCode = mergeOpenCode(catalog.opencode ?? [], outcomes.opencode);
  if (catalog.opencode !== undefined || openCode.reached) merged.opencode = openCode.records;
  counts.opencode = {
    visible: visibleCount(openCode.records),
    added: openCode.added,
    removed: openCode.removed,
  };
  if (openCode.reached) reachedHarnesses.push('opencode');

  return {
    catalog: merged,
    counts,
    reachedHarnesses,
    unreportedOpenCodePrefixes: openCode.unreportedPrefixes,
  };
}

function mergeRecords(existing: ModelRecord[], fetched: ProviderRecord[]): {
  records: ModelRecord[]; added: number; removed: number;
} {
  const fetchedById = new Map(fetched.map((record) => [record.id, record]));
  const existingIds = new Set(existing.map(({ id }) => id));
  const records = existing.flatMap((record) => {
    const fetchedRecord = fetchedById.get(record.id);
    return fetchedRecord === undefined ? [] : [withFetchedName(record, fetchedRecord)];
  });
  for (const record of fetched) {
    if (!existingIds.has(record.id)) records.push({ ...record });
  }
  return {
    records,
    added: fetched.filter(({ id }) => !existingIds.has(id)).length,
    removed: existing.filter(({ id }) => !fetchedById.has(id)).length,
  };
}

function mergeOpenCode(existing: ModelRecord[], outcome: ProviderOutcome): {
  records: ModelRecord[]; added: number; removed: number; reached: boolean; unreportedPrefixes: string[];
} {
  if (outcome.status !== 'ok') {
    return { records: existing, added: 0, removed: 0, reached: false, unreportedPrefixes: [] };
  }
  const fetchedByPrefix = groupOpenCodeRecords(outcome.records);
  if (fetchedByPrefix.size === 0) {
    return {
      records: existing,
      added: 0,
      removed: 0,
      reached: false,
      unreportedPrefixes: [...groupOpenCodeRecords(existing).keys()],
    };
  }
  const existingByPrefix = groupOpenCodeRecords(existing);
  const unreportedPrefixes = [...existingByPrefix.keys()].filter((prefix) => !fetchedByPrefix.has(prefix));
  const fetchedById = new Map(outcome.records.map((record) => [record.id, record]));
  const existingIds = new Set(existing.map(({ id }) => id));
  const records = existing.flatMap((record) => {
    const prefix = openCodePrefix(record.id);
    if (!fetchedByPrefix.has(prefix)) return [record];
    const fetched = fetchedById.get(record.id);
    return fetched === undefined ? [] : [withFetchedName(record, fetched)];
  });
  for (const record of outcome.records) {
    if (!existingIds.has(record.id)) records.push({ ...record });
  }
  const added = outcome.records.filter(({ id }) => !existingIds.has(id)).length;
  const removed = existing.filter((record) => (
    fetchedByPrefix.has(openCodePrefix(record.id)) && !fetchedById.has(record.id)
  )).length;
  return { records, added, removed, reached: true, unreportedPrefixes };
}

function groupOpenCodeRecords(records: ProviderRecord[]): Map<string, ProviderRecord[]> {
  const groups = new Map<string, ProviderRecord[]>();
  for (const record of records) {
    const prefix = openCodePrefix(record.id);
    const group = groups.get(prefix) ?? [];
    group.push(record);
    groups.set(prefix, group);
  }
  return groups;
}

function openCodePrefix(id: string): string {
  const slash = id.indexOf('/');
  return slash === -1 ? 'opencode' : id.slice(0, slash);
}

function withFetchedName(existing: ModelRecord, fetched: ProviderRecord): ModelRecord {
  return {
    id: existing.id,
    ...(fetched.name !== undefined && { name: fetched.name }),
    ...(existing.disabled !== undefined && { disabled: existing.disabled }),
    ...(existing.hidden !== undefined && { hidden: existing.hidden }),
  };
}

function visibleCount(records: ModelRecord[]): number {
  return records.filter(({ hidden }) => hidden !== true).length;
}
