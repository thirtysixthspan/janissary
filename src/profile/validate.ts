import { existsSync, readFileSync } from 'node:fs';
import { collectProfileProblems } from '../profile-schema.js';
import { profilePath, profileExists, listProfiles } from '../profiles.js';

// `profile validate [<name>]`: the same structural checks the loader runs, but collecting *every*
// problem with location context instead of failing on the first (Decision 9). Catalog-free — it
// checks shape only, never the semantic launch-time checks (unknown model/harness, etc.).

export function validateProfile(name: string): string[] {
  const filePath = profilePath(name);
  if (!existsSync(filePath)) return [`Profile file not found: ${filePath}`];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return ['not valid JSON'];
  }
  return collectProfileProblems(parsed);
}

// Build the command output: a single profile's status, or every profile's status when no name given.
export function reportValidation(name: string | undefined): string {
  if (name !== undefined) return reportOne(name);
  const names = listProfiles();
  return names.length > 0 ? names.map((profile) => reportOne(profile)).join('\n') : 'No profiles.';
}

function reportOne(name: string): string {
  if (!profileExists(name)) return `No profile named "${name}".`;
  const problems = validateProfile(name);
  if (problems.length === 0) return `Profile "${name}" is valid.`;
  return [`Profile "${name}" is not valid:`, ...problems.map((problem) => `  - ${problem}`)].join('\n');
}
