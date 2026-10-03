import path from 'node:path';

// Which of the names in a recordings directory a `play` target is asking for, decided with no
// filesystem and no timestamp parsing of its own: the caller supplies the names and the rule picks one.
//
// Every recording is `<label>-<ISO stamp>.cast` (see `harnessArtifactFilename`), so a name resolves in
// two ways and they are tried in that order. A **session's** recordings match `<stem>-<stamp>.cast`, and
// the newest is chosen — the stamp is fixed-width digits and dashes, so ordering those names lexically
// is ordering them in time, with no `stat` and no second reading of the format. Failing that, a file of
// exactly the name asked for answers, which is how a `.cast` some other tool wrote is still reached.
//
// The session pattern is anchored rather than a prefix, which is what keeps `devbox` from reaching
// `devbox-2-<stamp>.cast`: two sessions to the same ssh destination are labeled `devbox` and
// `devbox-2`, and a prefix match would hand either one whichever name sorted first.

// The stamp `harnessArtifactFilename` appends: an ISO instant with `:` and `.` replaced by `-`. The
// same pattern `asciicastLabelFromFilename` strips off a filename to recover the label it was named
// for, read here in the other direction — and an unanchored fragment rather than a pattern of its own,
// since it is composed into one below.
const RECORDING_STAMP = /\d{4}-\d{2}-\d{2}T[\d-]+Z/u;

function escapeForRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, (match) => `\\${match}`);
}

// The stem a target names: its basename with any `.cast` suffix removed, so `devbox` and `devbox.cast`
// ask the same question. An empty stem is no name at all, which matches nothing.
export function recordingStem(target: string): string {
  const base = path.basename(target.trim());
  return base.replace(/\.cast$/iu, '');
}

// `undefined` for a stem the directory does not answer to, and the name itself otherwise. Kept as a
// name rather than a path so the caller owns the directory it came from.
export function findRecording(names: readonly string[], stem: string): string | undefined {
  if (!stem) return undefined;
  const recorded = new RegExp(String.raw`^${escapeForRegExp(stem)}-${RECORDING_STAMP.source}\.cast$`, 'u');
  let newest: string | undefined;
  for (const name of names) {
    if (recorded.test(name) && (newest === undefined || name > newest)) newest = name;
  }
  if (newest !== undefined) return newest;
  const exact = `${stem}.cast`;
  return names.includes(exact) ? exact : undefined;
}