import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { isInteractive } from './interactive.js';
import { loadLearnedCommands, recordLearnedCommand } from './interactive-learned.js';

describe('isInteractive', () => {
  it('detects pagers and editors', () => {
    expect(isInteractive('less file.txt')).toBe(true);
    expect(isInteractive('vim src/cli.tsx')).toBe(true);
    expect(isInteractive('top')).toBe(true);
    expect(isInteractive('man ls')).toBe(true);
  });

  it('detects an interactive program at the end of a pipeline', () => {
    expect(isInteractive('git log | less')).toBe(true);
    expect(isInteractive('ps aux | less -S')).toBe(true);
  });

  it('looks through wrapper commands and env assignments', () => {
    expect(isInteractive('sudo vim /etc/hosts')).toBe(true);
    expect(isInteractive('PAGER=less less notes.md')).toBe(true);
    expect(isInteractive('env EDITOR=vi vim x')).toBe(true);
  });

  it('resolves the program basename from a path', () => {
    expect(isInteractive('/usr/bin/less file')).toBe(true);
  });

  it('returns false for non-interactive commands', () => {
    expect(isInteractive('ls -la')).toBe(false);
    expect(isInteractive('echo hello')).toBe(false);
    expect(isInteractive('cat file.txt')).toBe(false);
    expect(isInteractive('grep less file')).toBe(false); // less is an argument, not the program
  });

  it('handles empty input', () => {
    expect(isInteractive('')).toBe(false);
    expect(isInteractive(' '.repeat(3))).toBe(false);
  });
});

describe('isInteractive with learned commands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'interactive-test-'));
    mkdirSync(path.join(tmpDir, '.janissary'), { recursive: true });
    loadLearnedCommands(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    loadLearnedCommands(tmpDir);
  });

  it('matches a learned program name, wrappers and arguments included', () => {
    expect(isInteractive('mytui')).toBe(false);
    recordLearnedCommand('mytui');
    expect(isInteractive('mytui')).toBe(true);
    expect(isInteractive('mytui --watch')).toBe(true);
    expect(isInteractive('sudo mytui')).toBe(true);
  });

  it('matches a learned subcommand without capturing the whole program', () => {
    recordLearnedCommand('git log');
    expect(isInteractive('git log')).toBe(true);
    expect(isInteractive('git log --oneline')).toBe(true);
    expect(isInteractive('git status')).toBe(false);
    expect(isInteractive('git')).toBe(false);
  });

  it('keeps matching the built-in list when nothing has been learned', () => {
    expect(isInteractive('htop')).toBe(true);
    expect(isInteractive('ls')).toBe(false);
  });
});
