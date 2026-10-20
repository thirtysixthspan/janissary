import path from 'node:path';
import type { Managers } from '../managers.js';
import type { TabPluginDeclaration } from './api.js';
import type { TabPluginProjectCapabilities } from './api-project.js';
import type { PluginFailureOrigin } from './failure.js';
import { listProjectFiles } from '../file-navigator/search.js';
import { projectFilesFor } from '../project/files.js';
import { isInsideRoot } from './files.js';
import { withRunAllocation, withRunAllocationAsync } from './run-allocation.js';

// The capabilities that read the project the plugin runs in and open its files, moved out of
// `createPluginContext` because they depend on nothing beyond what they are handed.

export function projectCapabilities(input: {
  managers: Managers;
  declaration: TabPluginDeclaration;
  origin: PluginFailureOrigin;
  isEnabled: () => boolean;
}): TabPluginProjectCapabilities {
  const { managers, declaration, origin, isEnabled } = input;
  return {
    // The same gitignore-aware file list the `projectFiles` RPC already serves to Quick Open, so a
    // plugin that scans the repository cannot drift from the set Quick Open searches. The root comes
    // back alongside the paths because a relative path is not a path a plugin can open without it.
    // A root lists that directory instead, held to the same launch-directory bound as `openInEditor`.
    projectFileList: async (root) => {
      if (!isEnabled()) return { root: '', paths: [] };
      if (root === undefined) return projectFilesFor(managers);
      if (!isInsideRoot(managers.tab.launchDir, root)) return { root: '', paths: [] };
      const resolved = path.resolve(root);
      return { root: resolved, paths: await listProjectFiles(resolved) };
    },
    // Resolved so a trailing slash or `..` matches the normalized directories the manager keys by.
    workspaceTracked: (dir) =>
      isEnabled() && isInsideRoot(managers.tab.launchDir, dir) && managers.workspace.tracks(path.resolve(dir)),
    // Opens a file in an editor tab with the cursor on `line`, through the ordinary `edit` pipeline —
    // so the tab is de-duplicated, the line is centered, and the file is served by the same
    // authenticated `/open/<id>` allow-list as any other editor open. Deliberately not
    // `openClaimedFiles`, which is pinned to the plugin's own extensions and cannot express a line.
    //
    // A path outside the launch directory is refused. The capability is this plugin's whole reach
    // over the filesystem, so the boundary belongs here rather than in each plugin that asks: a
    // plugin holding one could otherwise name any path on the machine and have it opened and served.
    openInEditor: (absPath, line) => {
      if (!isEnabled() || !isInsideRoot(managers.tab.launchDir, absPath)) return;
      if (origin.runId && managers.agent.isAgentRun(origin.runId)) {
        void withRunAllocationAsync(managers, origin.runId, async (registerTab) => {
          if (!isEnabled()) return;
          await managers.openFile.editForCommand(
            `${declaration.id} ${absPath}:${line}`, absPath, origin.label, line, origin.runId, registerTab,
          );
        });
        return;
      }
      withRunAllocation(managers, origin.runId, (registerTab) => {
        if (origin.runId) {
          managers.openFile.edit(
            `${declaration.id} ${absPath}:${line}`, absPath, origin.label, line, origin.runId, registerTab,
          );
        } else {
          managers.openFile.edit(`${declaration.id} ${absPath}:${line}`, absPath, origin.label, line);
        }
      });
    },
  };
}
