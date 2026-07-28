import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeTranscriptSource, claudeProjectSlug } from './claude.js';

let home = '';
const cwd = '/work/project';
const spawnedAt = Date.UTC(2026, 0, 2);

function projectDirectory(): string {
  return path.join(home, '.claude', 'projects', claudeProjectSlug(cwd));
}

function writeSession(name: string, lines: string[], modified = spawnedAt + 1000): string {
  const file = path.join(projectDirectory(), name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, lines.map((line) => line + '\n').join(''));
  const seconds = modified / 1000;
  utimesSync(file, seconds, seconds);
  return file;
}

function userRecord(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'janus-claude-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('ClaudeTranscriptSource', () => {
  it('slugs a cwd into the projects directory name', () => {
    expect(claudeProjectSlug('/home/me/.config/app')).toBe('-home-me--config-app');
  });

  it('reports nothing and stays unresolved when the project directory does not exist', () => {
    const source = new ClaudeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([]);
    expect(source.resolved()).toBe(false);
  });

  it('picks the session whose mtime post-dates the spawn and ignores an older one', () => {
    writeSession('old.jsonl', [userRecord('from a previous session')], spawnedAt - 60_000);
    writeSession('current.jsonl', [userRecord('from this session')]);
    const source = new ClaudeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: from this session']);
    expect(source.resolved()).toBe(true);
  });

  it('returns only records appended since the previous poll', () => {
    const file = writeSession('current.jsonl', [userRecord('first')]);
    const source = new ClaudeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: first']);
    expect(source.poll()).toEqual([]);
    appendFileSync(file, userRecord('second') + '\n');
    expect(source.poll()).toEqual(['user: second']);
  });

  it('holds back a record that lands mid-line until its newline arrives', () => {
    const file = writeSession('current.jsonl', [userRecord('first')]);
    const source = new ClaudeTranscriptSource(cwd, spawnedAt, home);
    source.poll();
    const whole = userRecord('second');
    appendFileSync(file, whole.slice(0, 20));
    expect(source.poll()).toEqual([]);
    appendFileSync(file, whole.slice(20) + '\n');
    expect(source.poll()).toEqual(['user: second']);
  });

  it('discovers a subagent file that appears after the first poll and labels its entries', () => {
    writeSession('current.jsonl', [userRecord('dispatch a subagent')]);
    const source = new ClaudeTranscriptSource(cwd, spawnedAt, home);
    source.poll();
    const subagents = path.join(projectDirectory(), 'current', 'subagents');
    mkdirSync(subagents, { recursive: true });
    writeFileSync(path.join(subagents, 'agent-7.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'find the config' }));
    writeFileSync(path.join(subagents, 'agent-7.jsonl'), userRecord('search the repo') + '\n');
    expect(source.poll()).toEqual(['[Explore: find the config] user: search the repo']);
  });

  it('tails a subagent file with no meta file, unlabeled', () => {
    writeSession('current.jsonl', [userRecord('dispatch a subagent')]);
    const source = new ClaudeTranscriptSource(cwd, spawnedAt, home);
    source.poll();
    const subagents = path.join(projectDirectory(), 'current', 'subagents');
    mkdirSync(subagents, { recursive: true });
    writeFileSync(path.join(subagents, 'agent-9.jsonl'), userRecord('search the repo') + '\n');
    expect(source.poll()).toEqual(['user: search the repo']);
  });
});
