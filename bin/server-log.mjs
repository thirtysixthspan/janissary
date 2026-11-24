// Mirrors the filename shape of `harnessArtifactFilename` (src/harness/artifact-name.ts): a label
// followed by the UTC ISO timestamp with `:`/`.` replaced by `-` for portability across filesystems.
// Duplicated rather than imported across the .mjs/.ts boundary, the way bin/janus.mjs names its
// shared `__JANUS_URL__` constant.
export function serverLogFilename(timestamp) {
  const stamp = new Date(timestamp).toISOString().replaceAll(/[:.]/g, '-');
  return `localhost-${stamp}.log`;
}
