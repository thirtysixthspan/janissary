import { BUNDLED_MODEL_CATALOG, readCatalog, type ModelCatalog } from '../models/catalog-file.js';

let models: ModelCatalog = BUNDLED_MODEL_CATALOG;

// Reads `.janissary/known-models.json` from the project directory and, when present and valid,
// uses it in place of the bundled catalog for the rest of this run — the same load-with-fallback
// contract as `config.ts`'s `.janissary/config.json`.
export function loadHarnessModels(projectDirectory: string): void {
  models = readCatalog(projectDirectory).catalog;
}

export function modelsFor(harness: string): string[] {
  return (models[harness] ?? []).filter((model) => model.disabled !== true).map((model) => model.id);
}

export function isKnownModel(harness: string, model: string): boolean {
  return modelsFor(harness).includes(model);
}
