import { existsSync } from 'node:fs';
import path from 'node:path';
import { parsePlay } from '../commands/play.js';
import type { Managers } from '../managers.js';
import { playablePluginForExtension } from '../openers/index.js';
import { expandUserPath } from '../paths.js';

// `play <file>`: what plays a file is decided by the file, not by the command. The extension goes to
// the same opener registry `open` resolves through, which answers a plugin id only when that plugin
// has declared its claimed types playable, and the resolved file goes to that plugin's inline opener by
// the guarded path `open` uses — so activation, the deadline, and the failure boundary are not restated
// here. A plugin can never be handed a file it does not own: the registry resolved the owner from the
// extension before anything is asked of it.
//
// Every refusal is a line in the transcript the command was typed into, the way `open`, `video`, and
// `audio` report theirs — a command the user just typed is not a background event, so nothing here
// goes to the notifications feed.
export function runPlay(managers: Managers, input: string, label: string): string | undefined {
  const parsed = parsePlay(input);
  if ('error' in parsed) return parsed.error;
  const expanded = expandUserPath(parsed.target, { root: managers.tab.launchDir });
  const cwd = managers.tab.cwdOf(label) ?? process.cwd();
  const file = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  const plugin = playablePluginForExtension(path.extname(file));
  if (plugin === undefined) return `play: ${parsed.target}: not a playable file`;
  if (!existsSync(file)) return `play: ${file}: no such file`;
  void managers.plugins.runOpener(plugin, 'inline', file, { label, command: input });
  return undefined;
}