import { readFileSync } from 'node:fs';

// The log's content after `offset` bytes: what this launch's server has written since the launcher
// opened the log. A missing file, or one now shorter than the offset (truncated underneath us by a
// concurrent launch), has nothing of ours yet.
export function readLogSince(logPath, offset) {
  let bytes;
  try { bytes = readFileSync(logPath); } catch { return ''; }
  return bytes.length < offset ? '' : bytes.subarray(offset).toString('utf8');
}
