import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../../harness-models.json' with { type: 'json' };

let models: Record<string, string[]> = catalog;

// Reads `.janissary/harness-models.json` from the project directory and, when present and valid,
// uses it in place of the bundled catalog for the rest of this run — the same load-with-fallback
// contract as `config.ts`'s `.janissary/config.json`.
export function loadHarnessModels(projectDirectory: string): void {
  const overridePath = path.join(projectDirectory, '.janissary', 'harness-models.json');
  if (!existsSync(overridePath)) { models = catalog; return; }
  try {
    models = JSON.parse(readFileSync(overridePath, 'utf8')) as Record<string, string[]>;
  } catch {
    process.stderr.write('warning: .janissary/harness-models.json is invalid JSON — using the bundled catalog\n');
    models = catalog;
  }
}

export function modelsFor(harness: string): string[] {
  return models[harness] ?? [];
}

export function isKnownModel(harness: string, model: string): boolean {
  return modelsFor(harness).includes(model);
}
