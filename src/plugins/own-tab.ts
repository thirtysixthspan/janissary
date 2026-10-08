import type { Managers } from '../managers.js';
import type { PluginFailureOrigin } from './failure.js';
import type { TabPluginDeclaration } from './api.js';
import { TabPluginRejection } from './api-capabilities.js';

// The one ownership check the capability groups make: may this plugin act on that tab. It answers
// with the label when the tab is this plugin's own, and a rejection naming the caller's own reason
// when it is not — one meaning for the check, where before the line group answered `undefined` and
// four capabilities quietly did nothing while the ACP group beside it threw.
//
// The label is the answering tab when the host named one and the origin otherwise, which is all a
// command, selection action or menu handler has to go on.
export function ownTabLabel(
  input: {
    managers: Managers;
    declaration: TabPluginDeclaration;
    origin: PluginFailureOrigin;
    answeringLabel?: string;
  },
  reason: string,
): string {
  const { managers, declaration, origin, answeringLabel } = input;
  const label = answeringLabel ?? origin.label;
  if (managers.tab.byLabel(label)?.plugin?.id !== declaration.id) {
    throw new TabPluginRejection(reason);
  }
  return label;
}
