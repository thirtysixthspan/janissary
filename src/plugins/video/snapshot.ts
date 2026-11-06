import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { TabPluginServerCapabilities } from '../api.js';
import { extractFrame, type FrameExtractionError, type FrameExtractor } from './snapshot-ffmpeg.js';
import type { SnapshotRequest } from './snapshot-parse.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

function resolveTyped(cwd: string, typed: string): string {
  if (typed === '~') return homedir();
  if (typed.startsWith('~/')) return path.join(homedir(), typed.slice(2));
  return path.resolve(cwd, typed);
}

export function snapshotFailure(videoName: string, error: unknown): string {
  const failure = error as FrameExtractionError;
  if (failure.code === 'ENOENT') return `Cannot snapshot ${videoName}: ffmpeg is not installed or not on PATH.`;
  const detail = failure.stderr?.split('\n').find((line) => line.trim() !== '')?.trim()
    ?? (error instanceof Error ? error.message : String(error));
  return `Cannot snapshot ${videoName}: ${detail}`;
}

type SnapshotPaths = { video: string; destination: string };

function validatedPaths(
  request: SnapshotRequest, cwd: string, capabilities: TabPluginServerCapabilities,
): SnapshotPaths {
  const video = resolveTyped(cwd, request.video);
  const destination = resolveTyped(cwd, request.destination);
  if (statSync(video, { throwIfNoEntry: false })?.isFile() !== true) {
    capabilities.rejectRequest(`Cannot snapshot ${request.video}: no such file.`);
  }
  if (!IMAGE_EXTENSIONS.has(path.extname(destination).toLowerCase())) {
    capabilities.rejectRequest(
      `Cannot snapshot to ${request.destination}: the destination must end in .png, .jpg, or .jpeg.`,
    );
  }
  if (statSync(path.dirname(destination), { throwIfNoEntry: false })?.isDirectory() !== true) {
    capabilities.rejectRequest(`Cannot snapshot to ${request.destination}: its directory does not exist.`);
  }
  if (existsSync(destination)) {
    capabilities.rejectRequest(`Cannot snapshot to ${request.destination}: the file already exists.`);
  }
  return { video, destination };
}

// The command does not await the returned promise: a decode can outlast the plugin's handler
// deadline, so its outcome arrives later as a note.
export function startSnapshot(
  request: SnapshotRequest,
  capabilities: TabPluginServerCapabilities,
  extract: FrameExtractor = extractFrame,
): Promise<void> | undefined {
  const origin = capabilities.originTab();
  if (!origin) return undefined;
  if (origin.remote) {
    capabilities.rejectRequest('Cannot snapshot from a remote tab: its files are on another machine.');
  }
  const paths = validatedPaths(request, origin.cwd, capabilities);
  return runExtraction(request, paths, capabilities, extract);
}

async function runExtraction(
  request: SnapshotRequest,
  { video, destination }: SnapshotPaths,
  capabilities: TabPluginServerCapabilities,
  extract: FrameExtractor,
): Promise<void> {
  const name = path.basename(video);
  try {
    await extract(video, request.seconds, destination);
  } catch (error) {
    capabilities.note(snapshotFailure(name, error));
    return;
  }
  capabilities.note(existsSync(destination)
    ? `Saved the frame at ${request.time} in ${name} to ${destination}`
    : `No frame at ${request.time} in ${name}: the video is shorter than that.`);
}
