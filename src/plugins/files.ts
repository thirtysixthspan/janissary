import { statSync } from 'node:fs';
import path from 'node:path';
import { humanSize } from '../openers/size.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';

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
