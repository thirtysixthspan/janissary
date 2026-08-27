// The static declaration table and the lazy loader map. Reading the table loads no plugin code, so
// the chord table is available synchronously at the first keypress with nothing fetched.
//
// Never statically import an implementation module here. This module is reachable from the entry
// bundle, so a static import would pull that plugin's chunk in with it and silently defeat the lazy
// loading the thunks exist for — the same trap ../../plugins/registry.tsx records for tab plugins.

import {
  EDITOR_PLUGIN_API_VERSION,
  type EditorPluginDeclaration,
  type EditorPluginLoader,
} from './api';
import { chordId } from './chords';

export const editorPluginDeclarations = [
  {
    id: 'commenting',
    version: '1.0.0',
    apiVersion: EDITOR_PLUGIN_API_VERSION,
    bindings: [{ command: 'toggle-comment', chord: { key: '/', meta: true }, needs: 'selection' }],
  },
  {
    id: 'indenting',
    version: '1.0.0',
    apiVersion: EDITOR_PLUGIN_API_VERSION,
    // Two commands on four chords: the Cmd pair works in any context, while Tab and Shift+Tab reach
    // the same commands only where the core table yields them (see ../keys.ts `yieldsToPlugins`).
    bindings: [
      { command: 'indent', chord: { key: ']', meta: true }, needs: 'selection' },
      { command: 'indent', chord: { key: 'Tab' }, needs: 'selection' },
      { command: 'outdent', chord: { key: '[', meta: true }, needs: 'selection' },
      { command: 'outdent', chord: { key: 'Tab', shift: true }, needs: 'selection' },
    ],
  },
] as const satisfies readonly EditorPluginDeclaration[];

export type ProductionEditorPluginId = (typeof editorPluginDeclarations)[number]['id'];

export const editorPluginLoaders = {
  commenting: () => import('./commenting/index'),
  indenting: () => import('./indenting/index'),
} satisfies Record<ProductionEditorPluginId, EditorPluginLoader>;

export type DeclarationRejection = { id: string; reason: string };

export type ValidatedDeclarations = {
  accepted: readonly EditorPluginDeclaration[];
  rejections: readonly DeclarationRejection[];
};

function declarationFault(declaration: EditorPluginDeclaration): string | null {
  if (declaration.apiVersion !== EDITOR_PLUGIN_API_VERSION) {
    return `requires editor plugin API ${declaration.apiVersion}; host provides ${EDITOR_PLUGIN_API_VERSION}`;
  }
  if (declaration.bindings.length === 0) return 'declares no bindings';
  return null;
}

// Checked once, and a fault records a rejection rather than throwing, so one bad declaration
// disables that plugin and leaves every other one working.
export function validateDeclarations(
  declarations: readonly EditorPluginDeclaration[] = editorPluginDeclarations,
): ValidatedDeclarations {
  const accepted: EditorPluginDeclaration[] = [];
  const rejections: DeclarationRejection[] = [];
  const claimed = new Map<string, string>();

  for (const declaration of declarations) {
    const fault = declarationFault(declaration);
    if (fault !== null) {
      rejections.push({ id: declaration.id, reason: fault });
      continue;
    }
    const taken = declaration.bindings
      .map((binding) => ({ binding, owner: claimed.get(chordId(binding.chord)) }))
      .find((entry) => entry.owner !== undefined);
    if (taken?.owner !== undefined) {
      rejections.push({
        id: declaration.id,
        reason: `chord for "${taken.binding.command}" is already claimed by "${taken.owner}"`,
      });
      continue;
    }
    for (const binding of declaration.bindings) claimed.set(chordId(binding.chord), declaration.id);
    accepted.push(declaration);
  }

  return { accepted, rejections };
}
