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
  it('parses the role directive and body', () => {
    writePersona('monitor', 'security', '[//]: # role: ask\n\nWatch for security issues.\n');
    const persona = loadPersona('security', 'monitor', root);
    expect(persona.name).toBe('security');
    expect(persona.role).toBe('ask');
    expect(persona.body).toBe('Watch for security issues.');
  });

  it('rejects a missing persona file', () => {
    expect(() => loadPersona('nope', 'monitor', root)).toThrow(/No persona "nope"/);
  });

  it('rejects a file without a role directive', () => {
    writePersona('monitor', 'bare', 'Just some text.\nMore text.');
    expect(() => loadPersona('bare', 'monitor', root)).toThrow('Persona "bare": expected first line [//]: # role: <role>.');
  });

  it('rejects a malformed role directive', () => {
    writePersona('monitor', 'bad', '[//]: # claude:Sonnet:high\nBody.');
    expect(() => loadPersona('bad', 'monitor', root)).toThrow('Persona "bad": expected first line [//]: # role: <role>.');
  });

  it('rejects an empty role directive', () => {
    writePersona('monitor', 'empty', '[//]: # role: \nBody.');
    expect(() => loadPersona('empty', 'monitor', root)).toThrow('Persona "empty": expected first line [//]: # role: <role>.');
  });

  it('accepts a custom role name', () => {
    writePersona('monitor', 'planner', '[//]: # role: planning\nBody.');
    expect(loadPersona('planner', 'monitor', root).role).toBe('planning');
  });

  it('keeps a leftover tools line verbatim in the body', () => {
    writePersona('monitor', 'scout', '[//]: # role: ask\n[//]: # tools: web_search, web_fetch\n\nWatch and look things up.\n');
    const persona = loadPersona('scout', 'monitor', root);
    expect(persona.body).toBe('[//]: # tools: web_search, web_fetch\n\nWatch and look things up.');
  });
});

describe('the assistant persona', () => {
  it('loads from the project with the ask role and instructs harness-awareness (summarize, not suggest)', () => {
    // Loads the real ai/personas/monitor/assistant.md (default root = project cwd), not a synthetic one.
    const persona = loadPersona('assistant', 'monitor');
    expect(persona.role).toBe('ask');
    expect(persona.body.length).toBeGreaterThan(0);
    expect(persona.body.toLowerCase()).toContain('harness');
    expect(persona.body.toLowerCase()).toContain('summarize');
  });
});

describe('the editor assistant persona', () => {
  it('loads from the project with the ask role and a nonempty body', () => {
    // Loads the real ai/personas/editor/assistant.md (default root = project cwd), not a synthetic one.
    const persona = loadPersona('assistant', 'editor');
    expect(persona.role).toBe('ask');
    expect(persona.body.length).toBeGreaterThan(0);
  });
});

describe('the activity persona', () => {
  it('loads from the project with the ask role and is summarize-only', () => {
    // Loads the real ai/personas/monitor/activity.md (default root = project cwd), not a synthetic one.
    const persona = loadPersona('activity', 'monitor');
    expect(persona.role).toBe('ask');
    expect(persona.body.toLowerCase()).toContain('summarize');
    expect(persona.body.toLowerCase()).toContain('never make suggestions');
  });

  it('is listed among monitor personas, replacing the old summarizer name', () => {
    const names = listPersonas('monitor');
    expect(names).toContain('activity');
    expect(names).not.toContain('summarizer');
  });
});

describe('listPersonas', () => {
  it('lists persona names sorted, without extensions', () => {
    writePersona('monitor', 'security', '[//]: # role: ask');
    writePersona('monitor', 'assistant', '[//]: # role: ask');
    writeFileSync(path.join(root, 'ai', 'personas', 'monitor', 'notes.txt'), 'ignored');
    expect(listPersonas('monitor', root)).toEqual(['assistant', 'security']);
  });

  it('returns an empty list when the directory is missing', () => {
    expect(listPersonas('monitor', path.join(root, 'missing'))).toEqual([]);
  });

  it('scopes personas by kind: a name under one kind is invisible to the other', () => {
    writePersona('monitor', 'security', '[//]: # role: ask');
    writePersona('editor', 'assistant', '[//]: # role: ask');
    expect(listPersonas('monitor', root)).toEqual(['security']);
    expect(listPersonas('editor', root)).toEqual(['assistant']);
  });

  it('omits a persona file whose role directive is missing or malformed', () => {
    writePersona('monitor', 'good', '[//]: # role: ask\nBody.');
    writePersona('monitor', 'bad', '[//]: # claude:Sonnet:high\nBody.');
    writePersona('monitor', 'bare', 'No directive.');
    expect(listPersonas('monitor', root)).toEqual(['good']);
  });
});
