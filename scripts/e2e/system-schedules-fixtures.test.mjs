import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { projectFromEvidence, seedRunscript } from './system-schedules-fixtures.mjs';

test('system schedule fixtures stay in their owned project and reject unsafe roots or names', () => {
  const root = mkdtempSync(path.resolve('temp/system-schedules-project.fixture-XXXXXX-test'));
  const evidence = path.join(root, 'evidence');
  try {
    assert.equal(projectFromEvidence(evidence), root);
    const script = seedRunscript(evidence, 'probe-run', 'printf fixture-output\n');
    assert.equal(readFileSync(script, 'utf8'), 'printf fixture-output\n');
    assert.throws(() => projectFromEvidence(path.join(root, 'other')), /require temp/);
    assert.throws(() => seedRunscript(evidence, '../outside', 'unsafe'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
