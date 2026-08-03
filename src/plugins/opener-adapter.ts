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
      editGesture: declaration.editGesture,
      inline: (file, context) => context.runPluginOpener(declaration.id, 'inline', file),
      external: (file, context) => context.runPluginOpener(declaration.id, 'external', file),
    });
  }
  return openers;
}
