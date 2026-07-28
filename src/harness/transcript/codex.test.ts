import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexTranscriptSource } from './codex.js';

let home = '';
const cwd = '/work/project';
const spawnedAt = Date.now() - 60_000;

// The rollout file lives under the **spawn** date's directory, so the fixture builds that path from
// the same timestamp the source resolves against.
function sessionDirectory(): string {
  const spawn = new Date(spawnedAt);
  return path.join(
    home, '.codex', 'sessions',
    String(spawn.getFullYear()),
    String(spawn.getMonth() + 1).padStart(2, '0'),
    String(spawn.getDate()).padStart(2, '0'),
  );
}

function writeRollout(name: string, sessionCwd: string, lines: string[] = []): string {
  const file = path.join(sessionDirectory(), name);
  mkdirSync(path.dirname(file), { recursive: true });
  const meta = JSON.stringify({ type: 'session_meta', payload: { cwd: sessionCwd, id: name } });
  writeFileSync(file, [meta, ...lines].map((line) => line + '\n').join(''));
  return file;
}

function messageRecord(role: string, text: string): string {
  return JSON.stringify({ type: 'response_item', payload: { type: 'message', role, content: [{ type: 'input_text', text }] } });
}

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'janus-codex-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('CodexTranscriptSource', () => {
  it('reports nothing and stays unresolved when the day directory does not exist', () => {
    const source = new CodexTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([]);
    expect(source.resolved()).toBe(false);
  });

  it('chooses the rollout whose session_meta cwd matches and skips the one that does not', () => {
    writeRollout('rollout-a.jsonl', '/somewhere/else', [messageRecord('user', 'wrong session')]);
    writeRollout('rollout-b.jsonl', cwd, [messageRecord('user', 'right session')]);
    const source = new CodexTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: right session']);
    expect(source.resolved()).toBe(true);
  });

  it('produces no entry for the session_meta record itself', () => {
    writeRollout('rollout-a.jsonl', cwd);
    const source = new CodexTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([]);
    expect(source.resolved()).toBe(true);
  });

  it('returns only records appended since the previous poll', () => {
    const file = writeRollout('rollout-a.jsonl', cwd, [messageRecord('user', 'first')]);
    const source = new CodexTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: first']);
    expect(source.poll()).toEqual([]);
    appendFileSync(file, messageRecord('assistant', 'second') + '\n');
    expect(source.poll()).toEqual(['assistant: second']);
  });

  it('holds back a record that lands mid-line until its newline arrives', () => {
    const file = writeRollout('rollout-a.jsonl', cwd);
    const source = new CodexTranscriptSource(cwd, spawnedAt, home);
    source.poll();
    const whole = messageRecord('assistant', 'partial then whole');
    appendFileSync(file, whole.slice(0, 25));
    expect(source.poll()).toEqual([]);
    appendFileSync(file, whole.slice(25) + '\n');
    expect(source.poll()).toEqual(['assistant: partial then whole']);
  });
});
