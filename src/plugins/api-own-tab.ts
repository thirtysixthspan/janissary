// The capabilities that act on one of this plugin's own tabs, addressed by instance key, split off
// the main contract module and intersected back into `TabPluginServerCapabilities`.
export type TabPluginOwnTabCapabilities = {
  // Set the unread badge on one of this plugin's tabs. Raising it arms the standard waiting
  // notification; clearing it cancels that notification.
  setUnread(instanceKey: string, unread: boolean): void;
  // Light or clear the tab strip's busy dot on one of this plugin's tabs, addressed by instance key
  // like `setUnread`; a key with no open tab is a no-op. It changes the dot alone: the host's own
  // notion of a tab running a command, which `send` and `queue` consult, is not touched.
  setBusy(instanceKey: string, busy: boolean): void;
  // Dock one of this plugin's own tabs into a sidebar, or `null` to undock it back to the centre
  // strip and make it active. Addressed by instance key like `updateTab`, so a key with no open tab
  // is a silent no-op and a plugin can never move another plugin's tab.
  dockTab(instanceKey: string, dock: 'left' | 'right' | null): void;
  // Cache the text currently visible in one of this plugin's own tabs, so a monitor watching that
  // tab has something to feed on. The cache is server-only and is never broadcast to any client.
  // Addressed by instance key like `updateTab`, so a key with no open tab is a silent no-op and a
  // plugin can never write another plugin's snapshot.
  snapshotTab(instanceKey: string, text: string): void;
  // Close one of this plugin's own tabs through the ordinary close path, releasing what it holds, so a
  // tab can close itself with no browser connected. Addressed by instance key like `updateTab`: a key
  // with no open tab of this plugin's is a no-op, and so is a close that would quit the app because
  // the tab is the last one keeping it open. Callable from a `notify` handler.
  closeOwnTab(instanceKey: string): void;
  // The instance keys of this plugin's own open tabs, in strip order. A notification names them too,
  // but one only arrives while the plugin still has a tab open, so a plugin keeping state per tab asks
  // here before reusing any of it — the copy it kept for a tab closed since is then dropped rather
  // than reopened. Empty while the plugin is disabled.
  ownTabKeys(): readonly string[];
};
