import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPersona, listPersonas } from './personas.js';

let root: string;

function writePersona(name: string, content: string): void {
  writeFileSync(path.join(root, 'ai', 'personas', `${name}.md`), content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'personas-'));
  mkdirSync(path.join(root, 'ai', 'personas'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('loadPersona', () => {
  it('parses the harness directive and body', () => {
    writePersona('security', '[//]: # claude:Sonnet:high\n\nWatch for security issues.\n');
    const persona = loadPersona('security', root);
    expect(persona.name).toBe('security');
    expect(persona.harness).toEqual({ harness: 'claude', model: 'Sonnet', variant: 'high' });
    expect(persona.body).toBe('Watch for security issues.');
  });

  it('keeps colons and spaces inside the model name', () => {
    writePersona('fast', '[//]: # opencode:DeepSeek V4 Flash:max\nBody.');
    expect(loadPersona('fast', root).harness).toEqual({ harness: 'opencode', model: 'DeepSeek V4 Flash', variant: 'max' });
  });

  it('rejects a missing persona file', () => {
    expect(() => loadPersona('nope', root)).toThrow(/No persona "nope"/);
  });

  it('rejects a file without a directive', () => {
    writePersona('bare', 'Just some text.\nMore text.');
    expect(() => loadPersona('bare', root)).toThrow(/has no harness directive/);
  });

  it('rejects a directive without enough parts', () => {
    writePersona('short', '[//]: # opencode:model-only\nBody.');
    expect(() => loadPersona('short', root)).toThrow(/malformed harness directive/);
  });

  it('rejects an unknown harness', () => {
    writePersona('weird', '[//]: # gemini:Pro:high\nBody.');
    expect(() => loadPersona('weird', root)).toThrow(/Unknown harness "gemini"/);
  });
});

describe('listPersonas', () => {
  it('lists persona names sorted, without extensions', () => {
    writePersona('security', 'x');
    writePersona('assistant', 'x');
    writeFileSync(path.join(root, 'ai', 'personas', 'notes.txt'), 'ignored');
    expect(listPersonas(root)).toEqual(['assistant', 'security']);
  });

  it('returns an empty list when the directory is missing', () => {
    expect(listPersonas(path.join(root, 'missing'))).toEqual([]);
  });
});
