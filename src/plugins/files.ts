import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { humanSize } from '../openers/size.js';
import type { TabPluginDeclaration, TabPluginResources, TabPluginServerCapabilities } from './api.js';

// Whether `candidate` is `root` itself or lies beneath it. Both are resolved first, so a path
// carrying `..` is compared on its real location rather than its written one, and the comparison
// uses a trailing separator so a sibling directory whose name merely starts with the root's
// (`/repo-evil` beside `/repo`) is not accepted as inside it.
//
// An empty root means the project has not been established, so nothing is inside it — the answer a
// caller gets before it has a root to compare against. Published here rather than kept private
// because both the host and the plugins that ask it to open a file have to make this judgement, and
// the plugin import boundary permits a plugin to reach this module and nothing else of the host's.
export function isInsideRoot(root: string, candidate: string): boolean {
  if (root === '') return false;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved === resolvedRoot) return true;
  return resolved.startsWith(resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep);
}

// The operations every file-backed tab plugin performs, composed once from the capability primitives
// the contract already supplies. Deliberately plain functions taking a capability object rather than
// capabilities of their own: nothing here reaches past `openExternally`, `note`, and
// `configuredViewer`, so widening `TabPluginServerCapabilities` would be an API change under §4 of
// the plugin guidelines that bought only composition a plugin can already write for itself.

// The size a tab shows for the file it holds. The dispatcher checks existence before it dispatches,
// so the fallback covers a race with deletion rather than an ordinary miss, and a plugin that hits
// it still gets a usable tab.
export function fileSize(file: string): string {
  try {
    return humanSize(statSync(file).size);
  } catch {
    return 'unknown';
  }
}

// The name/path/size/url record every file-backed tab payload starts from. Plugins spread this and
// add whatever fields their own payload carries beyond it — a schema version, a mode, a player.
export function fileTabPayload(file: string, resources: TabPluginResources): {
  name: string; path: string; size: string; url: string;
} {
  return { name: path.basename(file), path: file, size: fileSize(file), url: resources.registerFile(file) };
}

// Hand a file to the OS and report what happened. `viewer` names the kind of application in both
// messages — "audio player", "image viewer", "viewer".
export function openFileExternally(
  file: string, capabilities: TabPluginServerCapabilities, viewer: string,
): void {
  if (capabilities.openExternally(file)) {
    capabilities.note(`Opening ${path.basename(file)} in your default ${viewer}…`);
    return;
  }
  capabilities.note(`No ${viewer} available. The file is at ${file}`);
}

// The same hand-off, trying the application the user configured first and naming it in the
// confirmation. Separate from `openFileExternally` rather than a flag on it because the two are not
// interchangeable: this one calls `configuredViewer`, and the host disables a plugin that reaches
// for a capability its manifest never declared. A plugin picks the one matching what it asked for.
export function openFileInConfiguredViewer(
  file: string, capabilities: TabPluginServerCapabilities, viewer: string,
): void {
  const configured = capabilities.configuredViewer();
  if (configured && capabilities.openExternally(file, configured)) {
    capabilities.note(`Opening ${path.basename(file)} in ${configured}…`);
    return;
  }
  openFileExternally(file, capabilities, viewer);
}

// Whether a declaration serves a content type for this file — the question that separates a file the
// plugin can present inline from one it can only hand to an external application. An extension
// claimed so the row has an owner but served with nothing answers false, which is what routes it out
// to the OS. Read from the manifest, so the two answers can never drift apart.
export function servesContentType(declaration: TabPluginDeclaration, file: string): boolean {
  return declaration.fileExtensions[path.extname(file).toLowerCase()] !== undefined;
}

// The shape a JSON config file answers once it has been read, parsed, and decoded — the decoded
// value, or one line naming the file and what was wrong with it. The three failure wording shapes
// are the ones every such file already uses, so they are produced here once.
export type JsonConfigResult<T> = { value: T; problem?: undefined } | { value?: undefined; problem: string };

export function writeJsonConfigFile(filePath: string, content: string): void {
  atomicWriteFile(filePath, content);
}

// The read-and-decode core every JSON config file in a plugin shares: the launcher and the roles
// reader both read a file, guard the read and the parse into the same two canned lines, and hand the
// parsed value to a decoder of their own. Only the decoder and the wording for "this parsed but did
// not decode" differ, so those are the two parameters and the fallback policy — what to do when a
// file is unusable — stays with each caller, because the two do not agree on it.
//
// Published here rather than in a module of its own because this is the one host file module the
// plugin import boundary admits to a concrete plugin, alongside `../api.js`; a new host module would
// be unreachable from a plugin without widening that boundary.
export function readJsonConfigFile<T>(
  filePath: string,
  fileName: string,
  decode: (parsed: unknown) => T | undefined,
  unusable: string,
): JsonConfigResult<T> {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return { problem: `${fileName} could not be read at ${filePath}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { problem: `${fileName} is not valid JSON at ${filePath}` };
  }
  const value = decode(parsed);
  return value === undefined ? { problem: `${fileName} ${unusable} at ${filePath}` } : { value };
}
