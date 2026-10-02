import type { Opener } from './types.js';
import { opener as editor } from './editor.js';
import { tabPluginCatalog } from '../plugins/catalog.js';
import { createPluginOpeners, playablePluginIds } from '../plugins/opener-adapter.js';
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

// The plugin `play` may hand a file of this extension to, or undefined when the file is not something
// to play. Three kinds of file answer undefined: one no opener claims, one a core opener claims (the
// plain-text editor answers for most extensions and plays none of them), and one a plugin claims whose
// types it has not declared playable — an image viewer owns `.png` and is not a player.
//
// The same registry `open` resolves through, so the two commands agree on which plugin owns a file and
// a plugin declares what it owns exactly once. Built from `pluginOpeners` for the reason the MIME
// composition below is: a declaration refused for a duplicate extension claim contributes no opener,
// and so is never named here either.
const playablePlugins = playablePluginIds(tabPluginCatalog);

export function playablePluginForExtension(extension: string): string | undefined {
  const lowerExtension = extension.toLowerCase();
  const opener = pluginOpeners.find((entry) => entry.extensions.includes(lowerExtension));
  return opener && playablePlugins.has(opener.name) ? opener.name : undefined;
}
