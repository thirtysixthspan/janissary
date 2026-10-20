// The capabilities that read the project a plugin runs in and open its files, split off the main
// contract module and intersected back into `TabPluginServerCapabilities`.
export type TabPluginProjectCapabilities = {
  // A gitignore-aware file list as forward-slash paths relative to the directory returned beside
  // them. With no argument it is the project's own list, the same one the `projectFiles` RPC serves
  // to Quick Open, so a plugin scanning the repository and a user picking a file see the same set.
  // With `root`, it lists that directory instead, which must be inside the launch directory (the
  // launch directory itself counts); a root outside it answers `{ root: '', paths: [] }`, the same
  // bound `openInEditor` applies. The root is returned because a relative path cannot be opened
  // without it.
  projectFileList(root?: string): Promise<{ root: string; paths: string[] }>;
  // Open a file in an editor tab with the cursor on `line`, through the ordinary `edit` pipeline: an
  // already-open file is focused rather than duplicated, the line is centered, and the file is
  // served by the authenticated `/open/<id>` allow-list like any other editor open. This is the
  // route for a plugin that must put a user on a specific line, which `openClaimedFiles` cannot
  // express — it is pinned to the plugin's own claimed extensions and takes no line.
  openInEditor(absPath: string, line: number): void;
  // Whether `dir` is a local workspace clone the host still tracks. False for a directory outside
  // the launch directory and while the plugin is disabled. It is how a plugin holding a local clone's
  // path, but riding nothing, learns that the clone has been removed.
  workspaceTracked(dir: string): boolean;
};
