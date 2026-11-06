import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { TabPluginRejection, type TabPluginOriginTab, type TabPluginServerCapabilities } from '../api.js';
import type { FrameExtractor } from './snapshot-ffmpeg.js';
import { snapshotFailure, startSnapshot } from './snapshot.js';

function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-snapshot-'));
  writeFileSync(path.join(dir, 'clip.mp4'), 'video');
  mkdirSync(path.join(dir, 'frames'));
  return dir;
}

function fakeCapabilities(origin: TabPluginOriginTab) {
  const notes: string[] = [];
  const capabilities = {
    note: (text: string) => { notes.push(text); },
    originTab: () => origin,
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, notes };
}

function localTab(cwd: string): TabPluginOriginTab {
  return { label: 'shell', cwd, root: cwd };
}

const writingExtractor: FrameExtractor = (_video, _seconds, destination) => {
  writeFileSync(destination, 'png');
  return Promise.resolve();
};

function request(video: string, destination: string) {
  return { video, time: '1:05', seconds: 65, destination };
}

describe('startSnapshot', () => {
  it('resolves both paths against the tab and reports the written frame', async () => {
    const dir = workspace();
    const extract = vi.fn(writingExtractor);
    const fixture = fakeCapabilities(localTab(dir));

    await startSnapshot(request('clip.mp4', 'frames/one.png'), fixture.capabilities, extract);

    const destination = path.join(dir, 'frames', 'one.png');
    expect(extract).toHaveBeenCalledWith(path.join(dir, 'clip.mp4'), 65, destination);
    expect(fixture.notes).toEqual([`Saved the frame at 1:05 in clip.mp4 to ${destination}`]);
  });

  it('expands a leading tilde to the home directory', async () => {
    const dir = workspace();
    const extract = vi.fn(() => Promise.resolve());
    const fixture = fakeCapabilities(localTab(dir));
    const name = `janus-snapshot-${path.basename(dir)}.png`;

    await startSnapshot(request(path.join(dir, 'clip.mp4'), `~/${name}`), fixture.capabilities, extract);

    expect(extract).toHaveBeenCalledWith(path.join(dir, 'clip.mp4'), 65, path.join(homedir(), name));
  });

  it('refuses what it can check before starting ffmpeg', () => {
    const dir = workspace();
    writeFileSync(path.join(dir, 'taken.png'), 'old');
    const extract = vi.fn(writingExtractor);
    const cases: [string, string, string][] = [
      ['missing.mp4', 'out.png', 'Cannot snapshot missing.mp4: no such file.'],
      ['frames', 'out.png', 'Cannot snapshot frames: no such file.'],
      ['clip.mp4', 'out.gif', 'Cannot snapshot to out.gif: the destination must end in .png, .jpg, or .jpeg.'],
      ['clip.mp4', 'nowhere/out.png', 'Cannot snapshot to nowhere/out.png: its directory does not exist.'],
      ['clip.mp4', 'taken.png', 'Cannot snapshot to taken.png: the file already exists.'],
    ];
    for (const [video, destination, message] of cases) {
      const fixture = fakeCapabilities(localTab(dir));
      expect(() => startSnapshot(request(video, destination), fixture.capabilities, extract))
        .toThrow(new TabPluginRejection(message));
    }
    expect(extract).not.toHaveBeenCalled();
  });

  it('refuses a remote tab, whose paths belong to another machine', () => {
    const dir = workspace();
    const extract = vi.fn(writingExtractor);
    const fixture = fakeCapabilities({ ...localTab(dir), remote: true });
    expect(() => startSnapshot(request('clip.mp4', 'out.png'), fixture.capabilities, extract))
      .toThrow(new TabPluginRejection('Cannot snapshot from a remote tab: its files are on another machine.'));
    expect(extract).not.toHaveBeenCalled();
  });

  it('does nothing without an invoking tab', () => {
    const extract = vi.fn(writingExtractor);
    const fixture = fakeCapabilities(null);
    expect(startSnapshot(request('clip.mp4', 'out.png'), fixture.capabilities, extract)).toBeUndefined();
    expect(extract).not.toHaveBeenCalled();
  });

  it('says so when ffmpeg finished but wrote no frame', async () => {
    const dir = workspace();
    const fixture = fakeCapabilities(localTab(dir));
    await startSnapshot(request('clip.mp4', 'late.png'), fixture.capabilities, () => Promise.resolve());
    expect(fixture.notes).toEqual(['No frame at 1:05 in clip.mp4: the video is shorter than that.']);
  });

  it('notes an ffmpeg failure instead of throwing', async () => {
    const dir = workspace();
    const fixture = fakeCapabilities(localTab(dir));
    const failing = () => Promise.reject(Object.assign(new Error('Command failed'), {
      code: 1, stderr: '\nclip.mp4: Invalid data found when processing input\nmore\n',
    }));
    await startSnapshot(request('clip.mp4', 'bad.png'), fixture.capabilities, failing);
    expect(fixture.notes).toEqual(['Cannot snapshot clip.mp4: clip.mp4: Invalid data found when processing input']);
  });
});

describe('snapshotFailure', () => {
  it('names a missing ffmpeg', () => {
    const error = Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' });
    expect(snapshotFailure('clip.mp4', error)).toBe('Cannot snapshot clip.mp4: ffmpeg is not installed or not on PATH.');
  });

  it('falls back to the error message when ffmpeg said nothing', () => {
    expect(snapshotFailure('clip.mp4', Object.assign(new Error('killed'), { stderr: '' })))
      .toBe('Cannot snapshot clip.mp4: killed');
    expect(snapshotFailure('clip.mp4', 'odd')).toBe('Cannot snapshot clip.mp4: odd');
  });
});
