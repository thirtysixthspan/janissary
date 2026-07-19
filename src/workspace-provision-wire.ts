// How long a tab whose workspace clone failed stays open (showing the error) before it's closed
// automatically — long enough to read a one-line error, short enough not to leave a dead tab
// sitting around. Shared by the harness and agent `--workspace` failure paths.
export const PROVISION_FAILURE_CLOSE_DELAY_MS = 3000;

// Shared "fire and forget" wiring for a workspace clone's `ready` promise (from
// `WorkspaceManager.create`), reused by both `HarnessManager` and `ProfileManager` since both now
// create their tab immediately and finish it asynchronously once the clone resolves. Kept out of
// either manager so the same guard-against-a-since-closed-tab logic isn't duplicated.
//
// `tabExists` is re-checked right before invoking either callback so a tab closed (and its clone
// cancelled) mid-provisioning is never resurrected by a clone that was already in flight.
export function wireProvisioning(
  label: string,
  ready: Promise<void>,
  tabExists: (label: string) => boolean,
  onReady: () => void,
  onFailed: (message: string) => void,
): void {
  async function settle(): Promise<void> {
    try {
      await ready;
      if (tabExists(label)) onReady();
    } catch (error) {
      if (tabExists(label)) onFailed(error instanceof Error ? error.message : String(error));
    }
  }
  void settle();
}
