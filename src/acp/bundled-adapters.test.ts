import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { janissaryRoot } from '../janissary-root.js';
import { acpLaunchForEntry } from './launch.js';

type PackageJson = {
  version?: string;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
};

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

function readPackageJson(dir: string): PackageJson {
  return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson;
}

function installedAdapter(name: string): PackageJson {
  return readPackageJson(path.join(janissaryRoot(), 'node_modules', ...name.split('/')));
}

function pinnedVersion(name: string): string | undefined {
  return readPackageJson(janissaryRoot()).dependencies?.[name];
}

describe.each([
  { harness: 'claude', adapter: '@agentclientprotocol/claude-agent-acp' },
  { harness: 'codex', adapter: '@agentclientprotocol/codex-acp' },
])('the bundled $harness adapter', ({ harness, adapter }) => {
  it('declares the bin name a role launch runs', () => {
    const launch = acpLaunchForEntry({ harness, model: 'any-model' });
    expect(Object.keys(installedAdapter(adapter).bin ?? {})).toContain(launch?.command);
  });

  it('is pinned to an exact version', () => {
    expect(pinnedVersion(adapter)).toMatch(EXACT_VERSION);
  });

  it('is installed at the pinned version', () => {
    expect(installedAdapter(adapter).version).toBe(pinnedVersion(adapter));
  });
});
