import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RemoteTranscriptFollow } from './serve-transcript.js';
import { claudeProjectSlug } from '../harness/transcript/claude.js';
import type { ServerFrame } from './protocol-frames.js';

// `RemoteTranscriptFollow` builds the far side's own source, so the only way to point that at a
// hermetic session record is the environment variable `os.homedir()` reads. Everything below runs
// against a temp home, never the machine's real `~/.claude`.

const POLL_MS = 2000;

let root: string;
let home: string;
let cwd: string;
let frames: ServerFrame[];
let follow: RemoteTranscriptFollow;
let previousHome: string | undefined;

function projectDirectory(): string {
  return path.join(home, '.claude', 'projects', claudeProjectSlug(cwd));
}

function writeSession(name: string, lines: string[]): string {
  const file = path.join(projectDirectory(), name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''));
  // Well after the spawn floor, which is the moment `follow` reads.
  const seconds = (Date.now() + 60_000) / 1000;
  utimesSync(file, seconds, seconds);
  return file;
}

function userRecord(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}

function tick(): void {
  vi.advanceTimersByTime(POLL_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'serve-transcript-')));
  home = path.join(root, 'home');
  cwd = path.join(root, 'project');
  mkdirSync(home);
  mkdirSync(cwd);
  previousHome = process.env.HOME;
  process.env.HOME = home;
  frames = [];
  follow = new RemoteTranscriptFollow((frame) => { frames.push(frame); });
});

afterEach(() => {
  follow.dispose();
  process.env.HOME = previousHome;
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

describe('RemoteTranscriptFollow.follow', () => {
  it('follows nothing when the frame names no directory to read', () => {
    follow.follow('claude', undefined);
    tick();
    expect(frames).toEqual([]);
  });

  it('follows nothing for a harness with no transcript source', () => {
    follow.follow('not-a-harness', cwd);
    tick();
    expect(frames).toEqual([]);
  });

  it('follows one harness once, so a second follow of another cannot take over', () => {
    writeSession('first.jsonl', [userRecord('from the first harness')]);
    follow.follow('claude', cwd);
    tick();
    const afterFirst = frames.length;

    follow.follow('claude', path.join(root, 'other-project'));
    tick();

    expect(frames).toHaveLength(afterFirst);
    expect(frames).toEqual([{ type: 'transcript', blocks: ['user: from the first harness'] }]);
  });

  it('emits a transcript frame carrying the blocks a poll produced', () => {
    writeSession('session.jsonl', [userRecord('first line'), userRecord('second line')]);
    follow.follow('claude', cwd);

    tick();
    expect(frames).toEqual([{ type: 'transcript', blocks: ['user: first line', 'user: second line'] }]);

    // The second poll reads only what arrived since, so nothing is emitted twice.
    tick();
    expect(frames).toHaveLength(1);
  });

  it('emits nothing on a poll with no new blocks, and nothing at all once disposed', () => {
    follow.follow('claude', cwd);
    tick();
    expect(frames).toEqual([]);

    writeSession('late.jsonl', [userRecord('written after the first poll')]);
    follow.dispose();
    tick();
    expect(frames).toEqual([]);
  });
});
