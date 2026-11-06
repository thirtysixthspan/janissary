import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractFrame } from './snapshot-ffmpeg.js';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

function testVideo(dir: string): string {
  const video = path.join(dir, 'clip.mp4');
  spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=64x48:rate=10', video,
  ]);
  return video;
}

describe.skipIf(!hasFfmpeg)('extractFrame', () => {
  it('writes the frame at the requested time as a PNG', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-ffmpeg-'));
    const destination = path.join(dir, 'frame.png');

    await extractFrame(testVideo(dir), 1.5, destination);

    expect(readFileSync(destination).subarray(1, 4).toString()).toBe('PNG');
  });

  it('writes nothing for a time past the end', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-ffmpeg-'));
    const destination = path.join(dir, 'late.png');

    await extractFrame(testVideo(dir), 30, destination);

    expect(existsSync(destination)).toBe(false);
  });

  it('rejects with ffmpeg\'s complaint for a file that is not a video', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-ffmpeg-'));
    await expect(extractFrame(path.join(dir, 'missing.mp4'), 1, path.join(dir, 'x.png')))
      .rejects.toMatchObject({ stderr: expect.stringContaining('missing.mp4') as unknown });
  });
});
