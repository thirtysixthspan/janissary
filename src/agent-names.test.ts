import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadAgentNames, agentNames } from './agent-names.js';
import defaultNames from '../agent-names.json' with { type: 'json' };

describe('loadAgentNames', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'agent-names-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('falls back to the bundled list when no override file exists', () => {
    loadAgentNames(tmpDir);
    expect(agentNames).toEqual(defaultNames);
  });

  it('reads a valid override file and uses it in place of the bundled list', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'agent-names.json'), JSON.stringify(['zeynep', 'baris']));

    loadAgentNames(tmpDir);
    expect(agentNames).toEqual(['zeynep', 'baris']);
  });

  it('falls back to the bundled list and warns on stderr when the override file is invalid JSON', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'agent-names.json'), 'not-json');

    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadAgentNames(tmpDir);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/agent-names.json is invalid JSON — using the bundled name list'),
    );
    writeSpy.mockRestore();

    expect(agentNames).toEqual(defaultNames);
  });
});
