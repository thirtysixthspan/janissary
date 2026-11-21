import type { SqlObject, SqlObjectKind } from '@shared/plugins/sql/shared';

const GROUP_LABELS = [
  { kind: 'table', label: 'Tables' },
  { kind: 'view', label: 'Views' },
  { kind: 'index', label: 'Indexes' },
  { kind: 'trigger', label: 'Triggers' },
] as const;

const BROWSABLE = new Set<string>(['table', 'view']);

type ObjectGroup = {
  kind: SqlObjectKind;
  label: string;
  entries: SqlObject[];
};

export function tableGroups(objects: readonly SqlObject[]): ObjectGroup[] {
  return GROUP_LABELS
    .map(({ kind, label }) => ({ kind, label, entries: objects.filter((object) => object.kind === kind) }))
    .filter((group) => group.entries.length > 0);
}

export function isBrowsableKind(kind: SqlObjectKind): boolean {
  return BROWSABLE.has(kind);
}
