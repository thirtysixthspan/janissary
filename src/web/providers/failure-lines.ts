export type ProviderFailure = { name: string; reason: string };

export type FailureHeadings = { failed: string; everyFailed: string };

export const WEB_SEARCH_FAILURE_HEADINGS: FailureHeadings = {
  failed: 'Web search failed',
  everyFailed: 'Web search: every provider failed.',
};

export const WEB_FETCH_FAILURE_HEADINGS: FailureHeadings = {
  failed: 'Web fetch failed',
  everyFailed: 'Web fetch: every attempt failed.',
};

export function formatFailures(
  failures: readonly ProviderFailure[],
  headings: FailureHeadings,
): string {
  if (failures.length === 1) {
    const failure = failures[0];
    return `${headings.failed} (${failure.name}): ${failure.reason}.`;
  }
  return [
    headings.everyFailed,
    ...failures.map((failure) => `- ${failure.name}: ${failure.reason}`),
  ].join('\n');
}
