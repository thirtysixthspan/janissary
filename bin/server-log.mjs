import { randomUUID } from 'node:crypto';
import { lstatSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';

// Mirrors the filename shape of `harnessArtifactFilename` (src/harness/artifact-name.ts): a label
// followed by the UTC ISO timestamp with `:`/`.` replaced by `-` for portability across filesystems.
// Duplicated rather than imported across the .mjs/.ts boundary, the way bin/janus.mjs names its
// shared `__JANUS_URL__` constant.
export function serverLogFilename(timestamp) {
  const stamp = new Date(timestamp).toISOString().replaceAll(/[:.]/g, '-');
  return `localhost-${stamp}.log`;
}

export function pointLatestLog(logDir, fileName) {
  const latestPath = path.join(logDir, 'latest.log');
  try {
    if (!lstatSync(latestPath).isSymbolicLink()) return 'not a symbolic link';
  } catch (error) {
    if (error.code !== 'ENOENT') return error.message;
  }
  const temporary = `${latestPath}.${randomUUID()}.tmp`;
  try {
    symlinkSync(fileName, temporary);
    renameSync(temporary, latestPath);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* best-effort cleanup */ }
    return error.message;
  }
}
