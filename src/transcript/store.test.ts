import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TranscriptStore } from './store.js';
import { messageBus } from '../bus.js';
import type { LogEntry } from '../tab/types.js';
import type { Tab } from '../tab/types.js';
import * as atomicWrite from '../atomic-write.js';

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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('uses atomic replacement for saves and per-tab clears', () => {
    const writer = vi.spyOn(atomicWrite, 'atomicWriteFile');

    TranscriptStore.save('janus', [entry('a', 'b')]);
    TranscriptStore.clearTab('janus');

    expect(writer).toHaveBeenNthCalledWith(1, expect.stringMatching(/janus\.json$/), '[{"input":"a","output":"b"}]');
    expect(writer).toHaveBeenNthCalledWith(2, expect.stringMatching(/janus\.json$/), '[]');
  });

  it('retains the last valid transcript and bounds warnings across failed writes', () => {
    const originalWriter = atomicWrite.atomicWriteFile;
    const writer = vi.spyOn(atomicWrite, 'atomicWriteFile');
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const oldLog = [entry('old', 'valid')];
    const newLog = [entry('new', 'content')];
    TranscriptStore.save('janus', oldLog);
    writer.mockImplementation(() => { throw new Error('disk full'); });

    TranscriptStore.save('janus', newLog);
    TranscriptStore.save('janus', newLog);

    expect(TranscriptStore.load('janus')).toEqual(oldLog);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('failed to persist transcript for janus: disk full'));

    writer.mockImplementation(originalWriter);
    TranscriptStore.save('janus', newLog);
    writer.mockImplementation(() => { throw new Error('read only'); });
    TranscriptStore.clearTab('janus');

    expect(TranscriptStore.load('janus')).toEqual(newLog);
    expect(warning).toHaveBeenCalledTimes(2);
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
