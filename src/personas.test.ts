import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
  it('parses the harness directive and body', () => {
    writePersona('monitor', 'security', '[//]: # claude:Sonnet:high\n\nWatch for security issues.\n');
    const persona = loadPersona('security', 'monitor', root);
    expect(persona.name).toBe('security');
    expect(persona.harness).toEqual({ harness: 'claude', model: 'Sonnet', variant: 'high' });
    expect(persona.body).toBe('Watch for security issues.');
  });

  it('keeps colons and spaces inside the model name', () => {
    writePersona('monitor', 'fast', '[//]: # opencode:DeepSeek V4 Flash:max\nBody.');
    expect(loadPersona('fast', 'monitor', root).harness).toEqual({ harness: 'opencode', model: 'DeepSeek V4 Flash', variant: 'max' });
  });

  it('rejects a missing persona file', () => {
    expect(() => loadPersona('nope', 'monitor', root)).toThrow(/No persona "nope"/);
  });

  it('rejects a file without a directive', () => {
    writePersona('monitor', 'bare', 'Just some text.\nMore text.');
    expect(() => loadPersona('bare', 'monitor', root)).toThrow(/has no harness directive/);
  });

  it('rejects a directive without enough parts', () => {
    writePersona('monitor', 'short', '[//]: # opencode:model-only\nBody.');
    expect(() => loadPersona('short', 'monitor', root)).toThrow(/malformed harness directive/);
  });

  it('rejects an unknown harness', () => {
    writePersona('monitor', 'weird', '[//]: # gemini:Pro:high\nBody.');
    expect(() => loadPersona('weird', 'monitor', root)).toThrow(/Unknown harness "gemini"/);
  });

  it('defaults to no tools when the tools line is absent', () => {
    writePersona('monitor', 'plain', '[//]: # claude:Sonnet:high\n\nBody.');
    expect(loadPersona('plain', 'monitor', root).tools).toEqual([]);
  });

  it('parses a tools line and keeps the body after it', () => {
    writePersona('monitor', 'scout', '[//]: # claude:Sonnet:high\n[//]: # tools: web_search, web_fetch\n\nWatch and look things up.\n');
    const persona = loadPersona('scout', 'monitor', root);
    expect(persona.tools).toEqual(['web_search', 'web_fetch']);
    expect(persona.body).toBe('Watch and look things up.');
  });

  it('tolerates case and whitespace and de-duplicates tool entries', () => {
    writePersona('monitor', 'scout', '[//]: # claude:Sonnet:high\n[//]: # tools:   WEB_SEARCH , web_fetch ,  web_search \nBody.');
    expect(loadPersona('scout', 'monitor', root).tools).toEqual(['web_search', 'web_fetch']);
  });

  it('treats an empty tools line as no tools', () => {
    writePersona('monitor', 'scout', '[//]: # claude:Sonnet:high\n[//]: # tools:\nBody.');
    expect(loadPersona('scout', 'monitor', root).tools).toEqual([]);
  });

  it('throws on an unknown tool name', () => {
    writePersona('monitor', 'scout', '[//]: # claude:Sonnet:high\n[//]: # tools: web_search, telepathy\nBody.');
    expect(() => loadPersona('scout', 'monitor', root)).toThrow(/requests unknown tool "telepathy" \(supported: web_search, web_fetch\)/);
  });

  it('treats a non-tools comment on the second line as body, not an error', () => {
    writePersona('monitor', 'noted', '[//]: # claude:Sonnet:high\n[//]: # just a note\nBody.');
    const persona = loadPersona('noted', 'monitor', root);
    expect(persona.tools).toEqual([]);
    expect(persona.body).toBe('[//]: # just a note\nBody.');
  });
});

describe('the assistant persona', () => {
  it('loads from the project and instructs harness-awareness (summarize, not suggest)', () => {
    // Loads the real ai/personas/monitor/assistant.md (default root = project cwd), not a synthetic one.
    const persona = loadPersona('assistant', 'monitor');
    expect(persona.harness.harness).toBeTruthy();
    expect(persona.body.length).toBeGreaterThan(0);
    expect(persona.body.toLowerCase()).toContain('harness');
    expect(persona.body.toLowerCase()).toContain('summarize');
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
