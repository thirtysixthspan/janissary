// The filename shape every per-tab harness artifact under `.janissary/` shares: a screen capture
// (`.txt`), an asciicast recording (`.cast`), and a session transcript (`.txt`). The label is
// sanitized rather than rejected — the tab exists, so its label is legitimate even when it holds
// filename-hostile characters (`/`, `.`) — and the ISO timestamp's `:`/`.` are replaced with `-`
// so the name is portable across filesystems.
export function harnessArtifactFilename(label: string, timestamp: number, extension: string): string {
  const safeLabel = label.replaceAll(/[^\w-]/g, '-');
  const stamp = new Date(timestamp).toISOString().replaceAll(/[:.]/g, '-');
  return `${safeLabel}-${stamp}${extension}`;
}
