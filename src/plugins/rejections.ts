// Contribution claims refused while the opener and command registries are built at module load.
// These are recorded rather than thrown so one malformed bundled manifest disables that one plugin
// instead of stopping the whole app from starting, which is what `ai/guidelines/plugins.md` section
// 7 requires ("the host starts successfully with every plugin broken"). `TabPluginHost` reads this
// at construction and marks the affected plugins disabled with the recorded reason.
const rejected = new Map<string, string>();

// First rejection per plugin wins, so the reported reason is the first conflict a reader would hit.
export function rejectContribution(id: string, reason: string): void {
  if (!rejected.has(id)) rejected.set(id, reason);
}

export function contributionRejection(id: string): string | undefined {
  return rejected.get(id);
}

// Test-only reset: the registries are module-scope singletons, so a test that feeds the adapters a
// conflicting fixture would otherwise leak its rejection into every later test in the file.
export function clearContributionRejections(): void {
  rejected.clear();
}
