import { modelsFor } from '../harness/models.js';

export function selectedModel(model: string | undefined): string {
  const available = modelsFor('opencode');
  const selected = model ?? available.find((item) => item === 'google/gemini-3.1-flash-lite') ?? available[0];
  if (!selected || !available.includes(selected)) throw new Error(`Agent: unknown model "${model ?? ''}".`);
  return selected;
}
