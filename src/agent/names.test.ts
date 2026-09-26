import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadAgentNames, agentNames } from './names.js';
import defaultNames from '../../agent-names.json' with { type: 'json' };

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

  // Loads `contents` as the override file and returns what the load wrote to stderr.
  function loadOverride(contents: unknown): string {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'agent-names.json'), JSON.stringify(contents));
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadAgentNames(tmpDir);
    const written = writeSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
    writeSpy.mockRestore();
    return written;
  }

  it('lowercases a capitalized override so drawn names match lowercased labels', () => {
    expect(loadOverride(['Alice', 'BOB'])).toBe('');
    expect(agentNames).toEqual(['alice', 'bob']);
  });

  it('drops duplicate names, including ones that differ only in case', () => {
    loadOverride(['zeynep', 'Zeynep', 'baris', 'zeynep']);
    expect(agentNames).toEqual(['zeynep', 'baris']);
  });

  it.each([
    ['a name containing "/"', ['zeynep', '../outside']],
    ['a name of ".."', ['zeynep', '..']],
    ['a name containing a space', ['zeynep', 'two words']],
    ['a non-string entry', ['zeynep', 7]],
    ['an empty list', []],
    ['an object instead of a list', { names: ['zeynep'] }],
    ['a bare string', 'zeynep'],
  ])('falls back to the bundled list and warns when the override holds %s', (_case, contents) => {
    expect(loadOverride(contents)).toContain(
      '.janissary/agent-names.json is not a non-empty list of valid agent names — using the bundled name list',
    );
    expect(agentNames).toEqual(defaultNames);
  });
});
