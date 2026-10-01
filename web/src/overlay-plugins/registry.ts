// The static declaration table and the lazy loader map. Reading the table loads no plugin code, so
// the chord and command tables are available synchronously at the first keypress with nothing
// fetched, and a disabled plugin is visible as disabled before anything tries to open it.
//
// Never statically import an implementation module here. This module is reachable from the entry
// bundle, so a static import would pull that plugin's chunk in with it and silently defeat the lazy
// loading the loaders exist for — the same trap `../plugins/registry.tsx` and
// `../editor/plugins/registry.ts` both record for their families.

import {
  OVERLAY_PLUGIN_API_VERSION,
  type OverlayPluginDeclaration,
  type OverlayPluginLoader,
} from './api';
import { overlayChordId } from './chords';

export const overlayPluginDeclarations = [
  {
    id: 'clipboard-history',
    version: '1.0.0',
    apiVersion: OVERLAY_PLUGIN_API_VERSION,
    // Ctrl+Shift+V, chosen because it is the chord every IDE clipboard history already uses and
    // because nothing here claims it. Plain Ctrl+V must stay the browser's own paste in an editor
    // buffer, which is why the shift is part of the claim rather than an afterthought.
    chord: { key: 'v', ctrl: true, shift: true },
    command: 'clip',
    title: 'clipboard',
    emptyText: '(no clipboard history)',
  },
] as const satisfies readonly OverlayPluginDeclaration[];

export type ProductionOverlayPluginId = (typeof overlayPluginDeclarations)[number]['id'];

export const overlayPluginLoaders = {
  'clipboard-history': () => import('./clipboard-history/index'),
} satisfies Record<ProductionOverlayPluginId, OverlayPluginLoader>;

// The command words the built-in dispatcher answers on its own. A plugin may not take one of these,
// the same list `src/plugins/command-adapter.ts` refuses against on the server.
const RESERVED_COMMANDS = new Set([
  'schedule', 'harness', 'ssh', 'shell', 'help',
  'agent', 'acp', 'browser', 'capture', 'close', 'command', 'connection', 'db',
  'edit', 'exit', 'files', 'hist', 'msg', 'nav', 'notifications', 'plugins',
  'profile', 'queue', 'quit', 'search', 'send', 'sessions', 'task', 'theme',
  'monitors', 'conversations', 'sql', 'monitor', 'broadcast',
]);

export type DeclarationRejection = { id: string; reason: string };

export type ValidatedDeclarations = {
  accepted: readonly OverlayPluginDeclaration[];
  rejections: readonly DeclarationRejection[];
};

function declarationFault(
  declaration: OverlayPluginDeclaration, takenChords: Map<string, string>, takenCommands: Map<string, string>,
): string | null {
  if (declaration.apiVersion !== OVERLAY_PLUGIN_API_VERSION) {
    return `requires overlay plugin API ${declaration.apiVersion}; host provides ${OVERLAY_PLUGIN_API_VERSION}`;
  }
  const chord = overlayChordId(declaration.chord);
  const chordOwner = takenChords.get(chord);
  if (chordOwner !== undefined) return `chord "${chord}" is already claimed by "${chordOwner}"`;
  const command = declaration.command.toLowerCase();
  if (RESERVED_COMMANDS.has(command)) return `command "${command}" is already a built-in command`;
  const commandOwner = takenCommands.get(command);
  if (commandOwner !== undefined) return `command "${command}" is already claimed by "${commandOwner}"`;
  return null;
}

// Checked once, and a fault records a rejection rather than throwing, so one bad declaration disables
// that plugin and leaves every other one working.
export function validateDeclarations(
  declarations: readonly OverlayPluginDeclaration[] = overlayPluginDeclarations,
): ValidatedDeclarations {
  const accepted: OverlayPluginDeclaration[] = [];
  const rejections: DeclarationRejection[] = [];
  const takenChords = new Map<string, string>();
  const takenCommands = new Map<string, string>();

  for (const declaration of declarations) {
    const fault = declarationFault(declaration, takenChords, takenCommands);
    if (fault !== null) {
      rejections.push({ id: declaration.id, reason: fault });
      continue;
    }
    takenChords.set(overlayChordId(declaration.chord), declaration.id);
    takenCommands.set(declaration.command.toLowerCase(), declaration.id);
    accepted.push(declaration);
  }

  return { accepted, rejections };
}
