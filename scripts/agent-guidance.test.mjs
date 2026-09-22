import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(import.meta.dirname, '..');

function readProjectFile(name) {
  return readFileSync(path.join(projectRoot, name), 'utf8');
}

describe('agent guidance', () => {
  it('keeps Claude Code on the canonical instructions', () => {
    expect(readProjectFile('CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('documents the reviewed project map and verification workflow', () => {
    const instructions = readProjectFile('AGENTS.md');

    expect(instructions).toContain('# Repository Guide for Coding Agents');
    expect(instructions).toContain('./scripts/run.mjs check-diff');
    expect(instructions).toContain('scripts/**/*.test.mjs');
    expect(instructions).toContain('.codex/` and `.claude/');
  });
});
