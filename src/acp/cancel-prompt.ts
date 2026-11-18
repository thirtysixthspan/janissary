import type { Managers } from '../managers.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { AcpRole } from './role.js';
import type { TabRuntime } from '../tab/types.js';
import { acpRoleRuntime } from './role-state.js';
import { settleAcpPrompt } from './response.js';
import { errorText } from '../error-text.js';

export function cancelAcpPrompt(
  managers: Managers,
  label: string,
  role: AcpRole,
  runtime: TabRuntime,
  request: AcpPendingPrompt,
  cancel: (() => Promise<void>) | undefined,
  isCurrentSession: () => boolean,
): Promise<boolean> {
  if (request.cancellation) return request.cancellation;
  const completion = { resolve: (_result: boolean) => {} };
  const settled = new Promise<boolean>((resolve) => { completion.resolve = resolve; });
  request.cancellation = settled;
  const finish = request.finish;
  request.finish = (result) => { finish(result); completion.resolve(true); };
  request.abort.abort();
  const current = () => managers.tab.byLabel(label)?.runtime === runtime
    && acpRoleRuntime(runtime, role).prompt === request
    && isCurrentSession();
  void (async () => {
    try {
      await cancel?.();
      if (current()) settleAcpPrompt(
        managers, label, { answered: false, error: 'ACP: prompt cancelled.' }, undefined, role,
      );
    } catch (error) {
      if (current()) managers.acp.close(label, `ACP: cancellation failed: ${errorText(error)}`, role);
    }
  })();
  return settled;
}
