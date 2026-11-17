export type ProviderFailure = { name: string; reason: string };

export function formatFailures(failures: readonly ProviderFailure[]): string {
  if (failures.length === 1) {
    const failure = failures[0];
    return `Web search failed (${failure.name}): ${failure.reason}.`;
  }
  return [
    'Web search: every provider failed.',
    ...failures.map((failure) => `- ${failure.name}: ${failure.reason}`),
  ].join('\n');
}
