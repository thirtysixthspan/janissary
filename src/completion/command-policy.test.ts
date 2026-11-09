import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NativeCommandSettingsManager } from '../native-commands/manager.js';
import { commandNameCandidates, completionPolicy, type CompletionPolicy } from './command-policy.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function policyWith(values: Record<string, { enabled?: boolean; agentAccess?: boolean }>): CompletionPolicy {
  const root = mkdtempSync(path.join(tmpdir(), 'completion-policy-'));
  roots.push(root);
  const home = path.join(root, 'home');
  mkdirSync(path.join(home, '.janissary'), { recursive: true });
  writeFileSync(path.join(home, '.janissary', 'commands.json'), JSON.stringify(values));
  const snapshot = new NativeCommandSettingsManager(path.join(root, 'project'), home).current();
  return completionPolicy(snapshot);
}

describe('completionPolicy', () => {
  it('allows enabled canonical names, aliases, and fixed forms', () => {
    const policy = completionPolicy();

    expect(policy.allows('browser')).toBe(true);
    expect(policy.allows('browser content')).toBe(true);
    expect(policy.allows('exit')).toBe(true);
  });

  it('refuses a disabled canonical name through its alias and native child forms', () => {
    const browser = policyWith({ browser: { enabled: false } });
    expect(browser.allows('browser')).toBe(false);
    expect(browser.allows('browser goto')).toBe(false);
    expect(browser.allows('browser content extra')).toBe(false);

    const close = policyWith({ close: { enabled: false } });
    expect(close.allows('close')).toBe(false);
    expect(close.allows('exit')).toBe(false);
  });

  it('refuses only the disabled native child', () => {
    const policy = policyWith({ 'browser content': { enabled: false } });

    expect(policy.allows('browser')).toBe(true);
    expect(policy.allows('browser goto')).toBe(true);
    expect(policy.allows('browser content')).toBe(false);
  });

  it('refuses only the disabled built-in fixed form', () => {
    const policy = policyWith({ 'tab dock': { enabled: false } });

    expect(policy.allows('tab')).toBe(true);
    expect(policy.allows('tab focus')).toBe(true);
    expect(policy.allows('tab dock now')).toBe(false);
    expect(policy.names).toContain('tab');
  });

  it('shares one setting across every owner of a canonical name', () => {
    const policy = policyWith({ search: { enabled: false } });

    expect(policy.allows('search transcript')).toBe(false);
    expect(policy.names).not.toContain('search');
  });

  it('treats a missing snapshot or row as enabled', () => {
    expect(completionPolicy().allows('browser')).toBe(true);
    expect(completionPolicy({ commands: [], source: 'default', path: '' }).allows('browser')).toBe(true);
  });

  it('leaves the shell ! form out of the first-word candidates', () => {
    const names = completionPolicy().names;

    expect(names).not.toContain('!');
    expect(names).toContain('shell');
    expect(completionPolicy().allows('!ls')).toBe(true);
  });
});

describe('commandNameCandidates', () => {
  it('derives sorted, deduplicated first words from forms and aliases', () => {
    const names = commandNameCandidates();

    expect(names).toEqual([...names].toSorted((left, right) => left.localeCompare(right)));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['browser', 'close', 'exit', 'db', 'help', 'question', 'search', 'tell']));
    for (const word of ['content', 'transcript', 'sqlite', 'reset']) expect(names).not.toContain(word);
  });

  it('hides every form and alias of a disabled name', () => {
    const disabled = policyWith({ browser: { enabled: false }, close: { enabled: false } });
    expect(disabled.names).not.toContain('browser');
    expect(disabled.names).not.toContain('close');
    expect(disabled.names).not.toContain('exit');
  });

  it('keeps a disabled native child from hiding its enabled parent word', () => {
    expect(policyWith({ 'browser content': { enabled: false } }).names).toContain('browser');
  });
});
