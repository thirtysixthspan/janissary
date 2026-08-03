import type { TabPluginDeclaration } from './api.js';
import { rejectContribution } from './rejections.js';

// Resolves the web-target claim: the one plugin that handles `open <url>` and `open page <address>`.
// Unlike an extension or a command claim there is nothing to enumerate — the host recognizes a web
// target syntactically (see `parseOpen`) and hands it to whoever claimed the kind — so this returns
// a single id rather than building a registry entry. A second claimant is refused the same way a
// duplicate extension claim is: recorded, not thrown, so one bad manifest disables that plugin
// rather than stopping the app from starting.
export function resolveWebClaim(
  declarations: readonly TabPluginDeclaration[],
): string | undefined {
  let claimed: string | undefined;
  for (const declaration of declarations) {
    if (!declaration.webTargets) continue;
    if (claimed === undefined) { claimed = declaration.id; continue; }
    rejectContribution(declaration.id, 'duplicate tab plugin web target claim');
  }
  return claimed;
}
