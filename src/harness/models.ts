import catalog from '../../harness-models.json' with { type: 'json' };

const models: Record<string, string[]> = catalog;

export function modelsFor(harness: string): string[] {
  return models[harness] ?? [];
}

export function isKnownModel(harness: string, model: string): boolean {
  return modelsFor(harness).includes(model);
}
