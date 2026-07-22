export type MainAreaCandidate = { label: string; number?: number; focus?: boolean };

export function focusedMainAreaLabel(candidates: MainAreaCandidate[], firstNewLabel: string | undefined): string | undefined {
  return candidates
    .filter((candidate) => candidate.focus)
    .toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))[0]?.label ?? firstNewLabel;
}
