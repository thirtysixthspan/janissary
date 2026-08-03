import type { Opener } from './types.js';
import { opener as editor } from './editor.js';
import { tabPluginCatalog } from '../plugins/catalog.js';
import { createPluginOpeners } from '../plugins/opener-adapter.js';
import { resolveWebClaim } from '../plugins/web-adapter.js';

// The opener registry. The `open` dispatcher walks this list in order and picks the first opener
// whose `extensions` include the target file's extension. Supporting a new file type is additive:
// add one opener module and one entry here — the dispatcher is never touched.
const coreOpeners: Opener[] = [
  editor,
];

// The plugin claims that survived conflict rejection. Exported on its own because MIME composition
// must be built from these rather than from the catalog — see `pluginContentTypes`.
export const pluginOpeners: Opener[] = createPluginOpeners(tabPluginCatalog, coreOpeners);

// The plugin holding the web-target claim. Web addresses resolve ahead of the extension registry —
// they have no extension to look one up by — so the `open` dispatcher asks for this id directly.
export const webClaimPluginId: string | undefined = resolveWebClaim(tabPluginCatalog);

export const openers: Opener[] = [
  ...coreOpeners,
  ...pluginOpeners,
];

// Find the opener registered for a file extension (lowercased, dot-prefixed), or undefined.
export function openerForExtension(extension: string): Opener | undefined {
  const lowerExtension = extension.toLowerCase();
  return openers.find((o) => o.extensions.includes(lowerExtension));
}

export type { Opener, OpenContext } from './types.js';
