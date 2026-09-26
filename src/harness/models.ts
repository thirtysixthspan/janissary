import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../../harness-models.json' with { type: 'json' };

let models: Record<string, string[]> = catalog;

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

// The catalog's only shape: a plain object mapping each harness name to a list of model ids.
export function decodeHarnessModels(value: unknown): Record<string, string[]> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const decoded: Record<string, string[]> = {};
  for (const [harness, list] of Object.entries(value)) {
    if (!isStringList(list)) return undefined;
    decoded[harness] = list;
  }
  return decoded;
}

// Reads `.janissary/harness-models.json` from the project directory and, when present and valid,
// uses it in place of the bundled catalog for the rest of this run — the same load-with-fallback
// contract as `config.ts`'s `.janissary/config.json`.
export function loadHarnessModels(projectDirectory: string): void {
  const overridePath = path.join(projectDirectory, '.janissary', 'harness-models.json');
  if (!existsSync(overridePath)) { models = catalog; return; }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(overridePath, 'utf8'));
  } catch {
    process.stderr.write('warning: .janissary/harness-models.json is invalid JSON — using the bundled catalog\n');
    models = catalog;
    return;
  }
  const decoded = decodeHarnessModels(parsed);
  if (decoded === undefined) {
    process.stderr.write('warning: .janissary/harness-models.json is not an object of model-id lists — using the bundled catalog\n');
  }
  models = decoded ?? catalog;
}

export function modelsFor(harness: string): string[] {
  return models[harness] ?? [];
}

export function isKnownModel(harness: string, model: string): boolean {
  return modelsFor(harness).includes(model);
}
