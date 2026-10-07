import type { Managers } from '../managers.js';
import { poolCandidates, suffixCandidates } from '../launch-name/check.js';
import { resolveLocalLaunchName } from '../launch-name/local.js';
import type { TabPluginDeclaration, TabPluginLaunchRequest } from './api.js';
import type { PluginFailureOrigin } from './failure.js';

function* poolThenPrefix(prefix: string): Generator<string> {
  yield* poolCandidates();
  yield* suffixCandidates(prefix);
}

// The label a launched plugin tab takes, or undefined once the name check refused it (and posted the
// refusal). A launch origin keeps its fixed label; a typed name is held to an agent launch's rules;
// an unnamed launch takes a free agent-pool name, then the plugin's prefix, `shell`, `shell-2`, …
export function resolveLaunchLabel(
  managers: Managers, declaration: TabPluginDeclaration, origin: PluginFailureOrigin,
  request: TabPluginLaunchRequest,
): string | undefined {
  if (origin.launch) return origin.label;
  const name = request.name?.trim() ?? '';
  const explicit = name !== '';
  return resolveLocalLaunchName(managers, {
    creator: origin.label,
    name,
    explicit,
    workspace: request.workspace !== undefined,
    ...(!explicit && { candidates: poolThenPrefix(declaration.tabLabelPrefix) }),
  });
}
