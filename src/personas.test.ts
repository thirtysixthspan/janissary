import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPersona, listPersonas } from './personas.js';

let root: string;

function writePersona(kind: 'monitor' | 'editor', name: string, content: string): void {
  writeFileSync(path.join(root, 'ai', 'personas', kind, `${name}.md`), content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'personas-'));
  mkdirSync(path.join(root, 'ai', 'personas', 'monitor'), { recursive: true });
  mkdirSync(path.join(root, 'ai', 'personas', 'editor'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('loadPersona', () => {
  it('parses the role directive and body', () => {
    writePersona('monitor', 'security', '[//]: # role:ask\n\nWatch for security issues.\n');
    const persona = loadPersona('security', 'monitor', root);
    expect(persona.name).toBe('security');
    expect(persona.role).toBe('ask');
    expect(persona.body).toBe('Watch for security issues.');
  });

  it('keeps a role name with spaces and colons', () => {
    writePersona('monitor', 'named', '[//]: # role:my custom:role\nBody.');
    expect(loadPersona('named', 'monitor', root).role).toBe('my custom:role');
  });

  it('rejects a missing persona file', () => {
    expect(() => loadPersona('nope', 'monitor', root)).toThrow(/No persona "nope"/);
  });

  it('throws the exact missing-directive string', () => {
    writePersona('monitor', 'bare', 'Just some text.\nMore text.');
    expect(() => loadPersona('bare', 'monitor', root))
      .toThrow('Persona "bare" has no role directive. First line must be: [//]: # role:<name>.');
  });

  it('throws the exact malformed-directive string', () => {
    writePersona('monitor', 'empty', '[//]: # role:\nBody.');
    expect(() => loadPersona('empty', 'monitor', root))
      .toThrow('Persona "empty" has a malformed role directive.');
  });

  it('treats a second tools line as body, not config', () => {
    writePersona('monitor', 'scout', '[//]: # role:ask\n[//]: # tools: web_search, web_fetch\n\nWatch and look things up.\n');
    const persona = loadPersona('scout', 'monitor', root);
    expect(persona.role).toBe('ask');
    expect(persona.body).toBe('[//]: # tools: web_search, web_fetch\n\nWatch and look things up.');
  });
});

describe('the shipped personas', () => {
  it.each([
    ['monitor', 'assistant'],
    ['monitor', 'activity'],
    ['monitor', 'security'],
    ['monitor', 'algorithm'],
    ['monitor', 'researcher'],
    ['monitor', 'link-scout'],
    ['editor', 'assistant'],
  ] as const)('loads %s/%s with the ask role', (kind, name) => {
    const persona = loadPersona(name, kind);
    expect(persona.role).toBe('ask');
    expect(persona.body.length).toBeGreaterThan(0);
  });

  it('names the ask role in the launcher persona and carries no tools line', () => {
    const raw = readFileSync(path.join(process.cwd(), 'ai', 'personas', 'launcher', 'summarizer.md'), 'utf8');
    expect(raw.split('\n', 1)[0]).toBe('[//]: # role:ask');
    expect(raw).not.toContain('[//]: # tools:');
  });

  it('names the ask role in the assistant persona and summarizes rather than suggests', () => {
    const persona = loadPersona('assistant', 'monitor');
    expect(persona.role).toBe('ask');
    expect(persona.body.toLowerCase()).toContain('harness');
    expect(persona.body.toLowerCase()).toContain('summarize');
  });

  it('names the ask role in the activity persona', () => {
    const persona = loadPersona('activity', 'monitor');
    expect(persona.role).toBe('ask');
    expect(persona.body.toLowerCase()).toContain('summarize');
    expect(persona.body.toLowerCase()).toContain('never make suggestions');
  });
});

describe('listPersonas', () => {
  it('lists persona names sorted, without extensions', () => {
    writePersona('monitor', 'security', 'x');
    writePersona('monitor', 'assistant', 'x');
    writeFileSync(path.join(root, 'ai', 'personas', 'monitor', 'notes.txt'), 'ignored');
    expect(listPersonas('monitor', root)).toEqual(['assistant', 'security']);
  });

  it('returns an empty list when the directory is missing', () => {
    expect(listPersonas('monitor', path.join(root, 'missing'))).toEqual([]);
  });

  it('scopes personas by kind: a name under one kind is invisible to the other', () => {
    writePersona('monitor', 'security', 'x');
    writePersona('editor', 'assistant', 'x');
    expect(listPersonas('monitor', root)).toEqual(['security']);
    expect(listPersonas('editor', root)).toEqual(['assistant']);
  });
});
