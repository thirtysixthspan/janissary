import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { janissaryRoot } from '../janissary-root.js';
import { BUNDLED_ACP_ADAPTERS } from './bundled-adapters.js';
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

it('keeps the bundled adapter roster in sync with role launches', () => {
  const launchCommands = [
    acpLaunchForEntry({ harness: 'claude', model: 'any-model' })?.command,
    acpLaunchForEntry({ harness: 'codex', model: 'any-model' })?.command,
  ];

  expect(new Set(launchCommands)).toEqual(new Set(Object.values(BUNDLED_ACP_ADAPTERS)));
});

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
