import { CORE_MIME } from '../mime-types.js';
import type { TabPluginDeclaration } from './api.js';
import { basicErrors, mimeClaimErrors } from './server/catalog.js';
import { videoManifest } from './video/manifest.js';

export const pluginManifests: readonly TabPluginDeclaration[] = [videoManifest];

// Plugin content types compose on top of `CORE_MIME` and can never replace one of its entries: a
// claim colliding with core (or with an earlier plugin) is a catalog error, and a rejected
// declaration contributes no MIME entry at all.
export function pluginMimeTypes(): Record<string, string> {
  const basic = basicErrors(pluginManifests);
  const claims = mimeClaimErrors(pluginManifests, CORE_MIME);
  return Object.fromEntries(pluginManifests.flatMap((manifest) => {
    if (basic.has(manifest.id) || claims.has(manifest.id)) return [];
    return Object.entries(manifest.opener?.mimeTypes ?? {})
      .map(([extension, mime]) => [extension.toLowerCase(), mime]);
  }));
}
