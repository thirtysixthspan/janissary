import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readPersonaBody } from './persona.js';

// Under the repository's own gitignored `temp/`, rather than the platform temporary directory: a
// sandbox a run may live in does not necessarily have one, and a scratch directory that cannot be
// created is a test that cannot run.
function scratch(contents?: string): string {
  mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
  const root = mkdtempSync(path.join(process.cwd(), 'temp', 'launcher-persona-'));
  mkdirSync(path.join(root, 'ai/personas/launcher'), { recursive: true });
  if (contents !== undefined) {
    writeFileSync(path.join(root, 'ai/personas/launcher/summarizer.md'), contents);
  }
  return root;
}

describe('reading the summarizer persona', () => {
  it('answers the copy the application ships with when the project has none', () => {
    const root = scratch();
    try {
      // `janus init` creates ai/personas/ and writes nothing into it, so this is every ordinary
      // project — the one case that used to throw before a single prompt was ever sent.
      expect(readPersonaBody(root)).toContain('status line the launcher');
      // The role is parsed but not sent: this session opens no connection of its own.
      expect(readPersonaBody(root)).not.toContain('[//]: # ');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('answers the project\'s own persona when it has written one', () => {
    const root = scratch('[//]: # role:ask\n\nA project of its own.\n');
    try {
      expect(readPersonaBody(root)).toBe('A project of its own.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a project persona whose first line is not a role directive', () => {
    const root = scratch('No directive here.\n');
    try {
      expect(() => readPersonaBody(root))
        .toThrow('ai/personas/launcher/summarizer.md has no role directive. First line must be: [//]: # role:<name>.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a project persona with an empty role name', () => {
    const root = scratch('[//]: # role:\n\nA project of its own.\n');
    try {
      expect(() => readPersonaBody(root))
        .toThrow('ai/personas/launcher/summarizer.md has no role directive. First line must be: [//]: # role:<name>.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // A project that has never run `janus init` has no `ai/` tree at all, which is the case a project
  // root pointing somewhere unrelated has too.
  it('answers the shipped persona for a root with no ai/ tree at all', () => {
    const root = mkdtempSync(path.join(process.cwd(), 'temp', 'launcher-noroot-'));
    try {
      expect(readPersonaBody(root)).toContain('status line the launcher');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
