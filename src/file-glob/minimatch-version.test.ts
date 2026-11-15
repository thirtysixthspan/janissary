import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Lockfile = {
  packages: Record<string, { version?: string }>;
};

const MINIMUM_SAFE_VERSION = '11.0.1';

const lockfilePath = path.join(import.meta.dirname, '..', '..', 'package-lock.json');

function atLeast(version: string, minimum: string): boolean {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  const [minMajor = 0, minMinor = 0, minPatch = 0] = minimum.split('.').map(Number);
  if (major !== minMajor) return major > minMajor;
  if (minor !== minMinor) return minor > minMinor;
  return patch >= minPatch;
}

describe('installed minimatch', () => {
  it('is at least 11.0.1 everywhere, so GHSA-g3hv-75wg-m249 stays fixed', () => {
    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8')) as Lockfile;
    const installed = Object.entries(lockfile.packages)
      .filter(([name]) => name.endsWith('node_modules/minimatch'))
      .map(([name, entry]) => ({ name, version: entry.version ?? '' }));
    expect(installed.length).toBeGreaterThan(0);
    expect(installed.filter(({ version }) => !atLeast(version, MINIMUM_SAFE_VERSION))).toEqual([]);
  });
});
