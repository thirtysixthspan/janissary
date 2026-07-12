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

  it('defaults to no tools when the tools line is absent', () => {
    writePersona('plain', '[//]: # claude:Sonnet:high\n\nBody.');
    expect(loadPersona('plain', root).tools).toEqual([]);
  });

  it('parses a tools line and keeps the body after it', () => {
    writePersona('scout', '[//]: # claude:Sonnet:high\n[//]: # tools: web_search, web_fetch\n\nWatch and look things up.\n');
    const persona = loadPersona('scout', root);
    expect(persona.tools).toEqual(['web_search', 'web_fetch']);
    expect(persona.body).toBe('Watch and look things up.');
  });

  it('tolerates case and whitespace and de-duplicates tool entries', () => {
    writePersona('scout', '[//]: # claude:Sonnet:high\n[//]: # tools:   WEB_SEARCH , web_fetch ,  web_search \nBody.');
    expect(loadPersona('scout', root).tools).toEqual(['web_search', 'web_fetch']);
  });

  it('treats an empty tools line as no tools', () => {
    writePersona('scout', '[//]: # claude:Sonnet:high\n[//]: # tools:\nBody.');
    expect(loadPersona('scout', root).tools).toEqual([]);
  });

  it('throws on an unknown tool name', () => {
    writePersona('scout', '[//]: # claude:Sonnet:high\n[//]: # tools: web_search, telepathy\nBody.');
    expect(() => loadPersona('scout', root)).toThrow(/requests unknown tool "telepathy" \(supported: web_search, web_fetch\)/);
  });

  it('treats a non-tools comment on the second line as body, not an error', () => {
    writePersona('noted', '[//]: # claude:Sonnet:high\n[//]: # just a note\nBody.');
    const persona = loadPersona('noted', root);
    expect(persona.tools).toEqual([]);
    expect(persona.body).toBe('[//]: # just a note\nBody.');
  });
});

describe('the assistant persona', () => {
  it('loads from the project and instructs harness-awareness (summarize, not suggest)', () => {
    // Loads the real ai/personas/assistant.md (default root = project cwd), not a synthetic one.
    const persona = loadPersona('assistant');
    expect(persona.harness.harness).toBeTruthy();
    expect(persona.body.length).toBeGreaterThan(0);
    expect(persona.body.toLowerCase()).toContain('harness');
    expect(persona.body.toLowerCase()).toContain('summarize');
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
