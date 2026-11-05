import type { ModelCatalog, ModelRecord } from './catalog-file.js';

export function copyModelCatalog(catalog: ModelCatalog): ModelCatalog {
  return Object.fromEntries(Object.entries(catalog).map(([harness, records]) => [
    harness,
    records.map((record) => ({ ...record })),
  ]));
}

export function modelCatalogsEqual(left: ModelCatalog, right: ModelCatalog): boolean {
  const leftHarnesses = Object.keys(left);
  const rightHarnesses = Object.keys(right);
  if (!sameStrings(leftHarnesses, rightHarnesses)) return false;
  return leftHarnesses.every((harness) => sameRecords(left[harness] ?? [], right[harness] ?? []));
}

function sameRecords(left: ModelRecord[], right: ModelRecord[]): boolean {
  return left.length === right.length && left.every((record, index) => {
    const other = right[index];
    return other !== undefined
      && record.id === other.id
      && record.name === other.name
      && record.disabled === other.disabled
      && record.hidden === other.hidden;
  });
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
