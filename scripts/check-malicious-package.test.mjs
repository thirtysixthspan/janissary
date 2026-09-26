import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// What a package-update playbook depends on is a process, not a function: the exit code is the
// verdict and the output says which lockfile was reached. So the gate is driven the way
// `run.mjs` drives it, as a child process, which is also the only way to catch a script that
// resolves its input against its own location rather than against the working directory.
const gate = path.join(import.meta.dirname, 'check-malicious-package.mjs');
const ownLockfile = path.resolve(import.meta.dirname, '..', 'package-lock.json');

let fixture;

afterEach(() => {
  if (fixture !== undefined) rmSync(fixture, { recursive: true, force: true });
  fixture = undefined;
});

function lockfileHolding(packages) {
  fixture = mkdtempSync(path.join(os.tmpdir(), 'malicious-package-'));
  const file = path.join(fixture, 'package-lock.json');
  const entries = {};
  for (const [name, version] of Object.entries(packages)) entries[`node_modules/${name}`] = { version };
  writeFileSync(file, JSON.stringify({ packages: entries }));
  return file;
}

function audit(args, options = {}) {
  const result = spawnSync(process.execPath, [gate, ...args], { encoding: 'utf8', ...options });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

describe('the package-safety gate', () => {
  it('audits the installation lockfile when no file is named', () => {
    const { out } = audit(['--audit']);
    expect(out).toContain(`Auditing ${ownLockfile}`);
  });

  // The defect this covers: a task prompt that installs into another project reached the gate
  // through the installation's runner, so the file judged was the installation's own rather than
  // the tree about to be installed.
  it('judges the lockfile it is given, not the one beside the script', () => {
    const file = lockfileHolding({ keyv: '6.0.0' });
    const { status, out, err } = audit(['--audit', file]);
    expect(out).toContain(`Auditing ${file}`);
    expect(err).toContain('keyv@6.0.0');
    expect(status).toBe(2);
  });

  it('reports a compromised account at an unlisted version without blocking', () => {
    const file = lockfileHolding({ hookified: '1.15.1' });
    const { status, out } = audit(['--audit', file]);
    expect(out).toContain('hookified@1.15.1');
    expect(status).toBe(0);
  });

  it('passes a lockfile holding nothing it knows about', () => {
    const file = lockfileHolding({ 'left-pad': '1.3.0' });
    const { status, out } = audit(['--audit', file]);
    expect(out).toContain('AUDIT CLEAN');
    expect(status).toBe(0);
  });

  // Exit 1 is a failed check, and a playbook that reads it as anything but a failure installs
  // without ever having been cleared.
  it('fails rather than passing when the lockfile cannot be read', () => {
    const missing = path.join(os.tmpdir(), 'no-such-lockfile-here', 'package-lock.json');
    const { status, err } = audit(['--audit', missing]);
    expect(err).toContain(missing);
    expect(status).toBe(1);
  });

  it('resolves a relative lockfile against the working directory', () => {
    lockfileHolding({ keyv: '6.0.0' });
    const { status, out } = audit(['--audit', 'package-lock.json'], { cwd: fixture });
    expect(out).toContain(`Auditing ${path.join(fixture, 'package-lock.json')}`);
    expect(status).toBe(2);
  });

  it('rejects an extra argument rather than ignoring it', () => {
    const file = lockfileHolding({ 'left-pad': '1.3.0' });
    const { status, err } = audit(['--audit', file, file]);
    expect(err).toContain('usage:');
    expect(status).toBe(1);
  });
});
