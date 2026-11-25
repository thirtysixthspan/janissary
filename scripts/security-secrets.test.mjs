import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scriptPath } from './script-path.mjs';

const securitySecrets = scriptPath('security-secrets.mjs');
const NOT_INSTALLED = 'gitleaks is not installed';

// PATH holds only the scratch bin directory, so the only gitleaks the script can find is one the
// test planted there.
function run(bin) {
  return spawnSync(process.execPath, [securitySecrets], {
    cwd: bin,
    encoding: 'utf8',
    env: { PATH: bin },
    timeout: 30_000,
  });
}

function plantGitleaks(bin, body) {
  const file = path.join(bin, 'gitleaks');
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

describe('security-secrets', () => {
  let bin;
  beforeEach(() => { bin = mkdtempSync(path.join(os.tmpdir(), 'security-secrets-')); });
  afterEach(() => { rmSync(bin, { recursive: true, force: true }); });

  it('warns and succeeds when gitleaks is not installed', () => {
    const result = run(bin);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(NOT_INSTALLED);
    expect(result.stderr).toContain('secrets were not scanned');
    expect(result.stderr).toContain('brew install gitleaks');
  });

  it('runs gitleaks detect with its output passed through when installed', () => {
    plantGitleaks(bin, 'echo "gitleaks $*"');

    const result = run(bin);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('gitleaks detect --no-banner --redact');
    expect(result.stderr).not.toContain(NOT_INSTALLED);
  });

  it("fails with gitleaks's own exit status when it reports leaks", () => {
    plantGitleaks(bin, 'echo "leaks found"; exit 1');

    const result = run(bin);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('leaks found');
    expect(result.stderr).not.toContain(NOT_INSTALLED);
  });
});
