import { execFile } from 'node:child_process';

const FFMPEG_TIMEOUT_MS = 60_000;

export type FrameExtractor = (video: string, seconds: number, destination: string) => Promise<void>;

export type FrameExtractionError = Error & { code?: unknown; stderr?: string };

// Both paths arrive absolute, so neither can be mistaken for an ffmpeg option.
export const extractFrame: FrameExtractor = (video, seconds, destination) => new Promise((resolve, reject) => {
  execFile('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
    '-ss', String(seconds), '-i', video, '-frames:v', '1', destination,
  ], { timeout: FFMPEG_TIMEOUT_MS }, (error, _stdout, stderr) => {
    if (error) {
      reject(Object.assign(error, { stderr }));
      return;
    }
    resolve();
  });
});
