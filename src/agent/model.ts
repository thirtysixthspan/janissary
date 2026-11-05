export function selectedModel(model: string | undefined, available: string[]): string {
  const selected = model ?? available.find((item) => item === 'google/gemini-3.1-flash-lite') ?? available[0];
  if (!selected || !available.includes(selected)) throw new Error(`Agent: unknown model "${model ?? ''}".`);
  return selected;
}
