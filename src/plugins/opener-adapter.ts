import type { Opener } from '../openers/types.js';
import type { TabPluginDeclaration } from './api.js';
import { rejectContribution } from './rejections.js';

// Builds one opener per declaration that claims file extensions. A claim already owned by core or by
// an earlier plugin is refused: that plugin contributes nothing and is recorded so the host can
// report it as disabled, rather than throwing and taking the whole app's startup down with it.
export function createPluginOpeners(
  declarations: readonly TabPluginDeclaration[],
  coreOpeners: readonly Opener[],
): Opener[] {
  const claims = new Set(coreOpeners.flatMap((opener) => opener.extensions.map((item) => item.toLowerCase())));
  const openers: Opener[] = [];
  for (const declaration of declarations) {
    const extensions = Object.keys(declaration.fileExtensions).map((extension) => extension.toLowerCase());
    const conflict = extensions.find((extension) => claims.has(extension));
    if (conflict !== undefined) {
      rejectContribution(declaration.id, `duplicate tab plugin extension claim "${conflict}"`);
      continue;
    }
    for (const extension of extensions) claims.add(extension);
    openers.push({
      name: declaration.id,
      extensions,
      editsOwnFiles: declaration.editsOwnFiles,
      editGesture: declaration.editGesture,
      inline: (file, context) => context.runPluginOpener(declaration.id, 'inline', file),
      external: (file, context) => context.runPluginOpener(declaration.id, 'external', file),
    });
  }
  return openers;
}

// The plugin ids the `play` command may dispatch a file to, from the declarations that say their
// claimed types are playable. Built from the catalog rather than from the accepted openers for one
// reason: a declaration rejected for a duplicate extension claim contributed no opener, and the
// lookup in `openers/index.ts` only ever asks about an extension the registry already resolved — so a
// disabled claimant can never be named here, because nothing ever reaches its id.
export function playablePluginIds(
  declarations: readonly TabPluginDeclaration[],
): ReadonlySet<string> {
  return new Set(
    declarations.filter((declaration) => declaration.playable).map((declaration) => declaration.id),
  );
}

// The content types the server should serve for plugin-claimed files, composed from the openers
// `createPluginOpeners` actually accepted rather than from the raw catalog. Reading the catalog
// directly would let a declaration rejected for a duplicate extension still name that extension's
// MIME type, and would hand the type to the last of two duplicate claimants while the first owns
// the opener. `accepted` carries exactly the surviving claims, so the two can no longer disagree.
export function pluginContentTypes(
  declarations: readonly TabPluginDeclaration[],
  accepted: readonly Opener[],
): Record<string, string> {
  const byId = new Map(declarations.map((declaration) => [declaration.id, declaration]));
  const types: Record<string, string> = {};
  for (const opener of accepted) {
    const declared = byId.get(opener.name)?.fileExtensions;
    if (!declared) continue;
    const declaredTypes = new Map(Object.entries(declared)
      .map(([extension, type]) => [extension.toLowerCase(), type] as const));
    for (const extension of opener.extensions) {
      const type = declaredTypes.get(extension);
      if (type !== undefined) types[extension] = type;
    }
  }
  return types;
}
