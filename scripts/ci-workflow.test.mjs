import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW_FILE = path.resolve('.github/workflows/ci.yml');

function jobBlocks() {
  const text = readFileSync(WORKFLOW_FILE, 'utf8');
  const jobsSection = text.slice(text.indexOf('\njobs:\n'));
  const blocks = new Map();
  let current;
  for (const line of jobsSection.split('\n')) {
    const key = /^ {2}([\w-]+):\s*$/.exec(line);
    if (key) {
      current = key[1];
      blocks.set(current, []);
    } else if (current) {
      blocks.get(current).push(line.trim());
    }
  }
  return blocks;
}

describe('pull request CI workflow', () => {
  it.each([
    ['typescript', 'npm run typecheck'],
    ['lint', 'npm run lint'],
    ['tests', 'npm run test'],
    ['build', 'npm run build'],
  ])('has a %s job that installs dependencies and runs %s', (job, command) => {
    const steps = jobBlocks().get(job);
    expect(steps).toBeDefined();
    const install = steps.indexOf('- run: npm ci');
    const run = steps.indexOf(`- run: ${command}`);
    expect(install).toBeGreaterThanOrEqual(0);
    expect(run).toBeGreaterThan(install);
  });
});
