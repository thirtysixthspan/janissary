import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parsePlay } from '../commands/play.js';
import type { Managers } from '../managers.js';
import { playablePluginForExtension } from '../openers/index.js';
import { expandUserPath } from '../paths.js';
import { harnessRecordingDirectory } from '../harness/recording-file.js';
import { findRecording, recordingStem } from './recording-search.js';

// `play <file>`: what plays a file is decided by the file, not by the command. The extension goes to
// the same opener registry `open` resolves through, which answers a plugin id only when that plugin
// has declared its claimed types playable, and the resolved file goes to that plugin's inline opener by
// the guarded path `open` uses — so activation, the deadline, and the failure boundary are not restated
// here. A plugin can never be handed a file it does not own: the registry resolved the owner from the
// extension before anything is asked of it.
//
// A target that carries an extension is answered by type before any file question is asked, so a
// `.txt` or a `.png` is refused whether or not a file of that name exists. A target that carries none
// is a recording name rather than a type — nothing else could resolve one, and refusing it by type
// would leave only the awkward half-typed `play devbox.cast` able to reach a session.
//
// Every refusal is a line in the transcript the command was typed into, the way `open`, `video`, and
// `audio` report theirs — a command the user just typed is not a background event, so nothing here
// goes to the notifications feed.
export function runPlay(managers: Managers, input: string, label: string): string | undefined {
  const parsed = parsePlay(input);
  if ('error' in parsed) return parsed.error;
  if (path.extname(parsed.target) && !playablePluginForExtension(path.extname(parsed.target))) {
    return `play: ${parsed.target}: not a playable file`;
  }
  const file = resolveTarget(managers, label, parsed.target);
  if (!existsSync(file)) return `play: ${file}: no such file`;
  // Read from the resolved file rather than from what was typed, so a target that named no extension
  // is dispatched by the recording the fallback found for it.
  const plugin = playablePluginForExtension(path.extname(file));
  if (plugin === undefined) return `play: ${parsed.target}: not a playable file`;
  void managers.plugins.runOpener(plugin, 'inline', file, { label, command: input });
  return undefined;
}

// The file the target names, resolved the way `open` resolves one. A path that is already there is
// played as written; only one that is not falls through to the recordings directory, so the fallback
// can never quietly open a different recording than the one asked for.
function resolveTarget(managers: Managers, label: string, target: string): string {
  const expanded = expandUserPath(target, { root: managers.tab.launchDir });
  const cwd = managers.tab.cwdOf(label) ?? process.cwd();
  const requested = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  if (existsSync(requested)) return requested;
  return recordedByName(target) ?? requested;
}

// The recording of the name the user typed, or undefined when the directory has none. The path comes
// from the module that owns the directory, which is what the recorders themselves write into.
function recordedByName(target: string): string | undefined {
  const directory = harnessRecordingDirectory();
  if (!directory) return undefined;
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return undefined;
  }
  const match = findRecording(names, recordingStem(target));
  return match === undefined ? undefined : path.join(directory, match);
}