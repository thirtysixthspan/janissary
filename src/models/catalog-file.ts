import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../../known-models.json' with { type: 'json' };
import { atomicWriteFile } from '../atomic-write.js';

export type ModelRecord = {
  id: string;
  name?: string;
  disabled?: boolean;
  hidden?: boolean;
};

export type ModelCatalog = Record<string, ModelRecord[]>;

export type CatalogRead = {
  catalog: ModelCatalog;
  fromOverride: boolean;
  overridePath: string;
};

export function decodeModelCatalog(value: unknown): ModelCatalog | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const decoded: ModelCatalog = {};
  for (const [harness, valueForHarness] of Object.entries(value)) {
    if (!Array.isArray(valueForHarness)) return undefined;
    const records: ModelRecord[] = [];
    for (const valueForRecord of valueForHarness) {
      if (typeof valueForRecord !== 'object' || valueForRecord === null || Array.isArray(valueForRecord)) {
        return undefined;
      }
      const record = valueForRecord as Record<string, unknown>;
      if (typeof record.id !== 'string' || record.id.length === 0) return undefined;
      if (record.name !== undefined && typeof record.name !== 'string') return undefined;
      if (record.disabled !== undefined && typeof record.disabled !== 'boolean') return undefined;
      if (record.hidden !== undefined && typeof record.hidden !== 'boolean') return undefined;
      records.push({
        id: record.id,
        ...(record.name !== undefined && { name: record.name }),
        ...(record.disabled !== undefined && { disabled: record.disabled }),
        ...(record.hidden !== undefined && { hidden: record.hidden }),
      });
    }
    decoded[harness] = records;
  }
  return decoded;
}

const bundledCatalog = decodeModelCatalog(catalog);
if (bundledCatalog === undefined) throw new Error('Bundled known-models.json is invalid.');

export const BUNDLED_MODEL_CATALOG: ModelCatalog = bundledCatalog;

export function encodeModelCatalog(value: ModelCatalog): string {
  const encoded = Object.fromEntries(Object.entries(value).map(([harness, records]) => [
    harness,
    records.map(({ id, name, disabled, hidden }) => ({
      id,
      ...(name !== undefined && { name }),
      ...(disabled === true && { disabled: true }),
      ...(hidden === true && { hidden: true }),
    })),
  ]));
  return `${JSON.stringify(encoded, null, 2)}\n`;
}

export function readCatalog(projectDirectory: string): CatalogRead {
  const overridePath = path.join(projectDirectory, '.janissary', 'known-models.json');
  if (!existsSync(overridePath)) return { catalog: BUNDLED_MODEL_CATALOG, fromOverride: false, overridePath };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(overridePath, 'utf8'));
  } catch {
    process.stderr.write('warning: .janissary/known-models.json is invalid JSON — using the bundled catalog\n');
    return { catalog: BUNDLED_MODEL_CATALOG, fromOverride: false, overridePath };
  }

  const decoded = decodeModelCatalog(parsed);
  if (decoded === undefined) {
    process.stderr.write('warning: .janissary/known-models.json is not an object of model-record lists — using the bundled catalog\n');
    return { catalog: BUNDLED_MODEL_CATALOG, fromOverride: false, overridePath };
  }
  return { catalog: decoded, fromOverride: true, overridePath };
}

export function writeCatalog(overridePath: string, value: ModelCatalog): void {
  mkdirSync(path.dirname(overridePath), { recursive: true });
  atomicWriteFile(overridePath, encodeModelCatalog(value));
}
