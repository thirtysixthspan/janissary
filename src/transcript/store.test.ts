import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TranscriptStore } from './store.js';
import { messageBus } from '../bus.js';
import type { LogEntry } from '../types.js';
import type { Tab } from '../types.js';

const entry = (input: string, output: string): LogEntry => ({ input, output });
const tabWith = (label: string, log: LogEntry[]): Readonly<Tab> => ({ label, log }) as Readonly<Tab>;

const appendEvent = (label: string, log: LogEntry[]) => ({
  type: 'entry:appended' as const,
  tabLabel: label,
  entry: log.at(-1)!,
  tab: tabWith(label, log),
});

describe('TranscriptStore I/O', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'janus-transcript-'));
    new TranscriptStore(dir);
  });

  it('load returns undefined when no file exists', () => {
    expect(TranscriptStore.load('ghost')).toBeUndefined();
  });

  it('save round-trips through load', () => {
    const log = [entry('help', 'usage text')];
    TranscriptStore.save('janus', log);
    expect(TranscriptStore.load('janus')).toEqual(log);
  });

  it('save creates the directory if absent', () => {
    TranscriptStore.clear();
    new TranscriptStore(dir);
    TranscriptStore.save('janus', [entry('a', 'b')]);
    expect(TranscriptStore.load('janus')).toBeDefined();
  });

  it('clearTab writes an empty array', () => {
    TranscriptStore.save('janus', [entry('x', 'y')]);
    TranscriptStore.clearTab('janus');
    expect(TranscriptStore.load('janus')).toEqual([]);
  });

  it('clear makes all transcripts unreadable', () => {
    TranscriptStore.save('janus', [entry('a', 'b')]);
    TranscriptStore.clear();
    expect(TranscriptStore.load('janus')).toBeUndefined();
  });
});

describe('TranscriptStore bus subscription', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'janus-transcript-bus-'));
    messageBus.clear();
    new TranscriptStore(dir);
  });

  afterEach(() => {
    messageBus.clear();
  });

  it('persists the full log on entry:appended', () => {
    const log = [entry('help', 'usage')];
    messageBus.emit('transcript', appendEvent('janus', log));
    expect(TranscriptStore.load('janus')).toEqual(log);
  });

  it('writes [] on tab:cleared', () => {
    TranscriptStore.save('janus', [entry('x', 'y')]);
    messageBus.emit('transcript', { type: 'tab:cleared', tabLabel: 'janus' });
    expect(TranscriptStore.load('janus')).toEqual([]);
  });

  it('does not remove the file on tab:removed', () => {
    TranscriptStore.save('janus', [entry('a', 'b')]);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'janus' });
    expect(TranscriptStore.load('janus')).toBeDefined();
  });

  it('save() writes directly without a bus event', () => {
    new TranscriptStore(dir);
    TranscriptStore.save('bob', [entry('direct', 'write')]);
    expect(TranscriptStore.load('bob')).toBeDefined();
  });

  it('load() reads the stored file', () => {
    TranscriptStore.save('alice', [entry('hello', 'world')]);
    expect(TranscriptStore.load('alice')).toEqual([entry('hello', 'world')]);
  });
});
