import type { SearchMatch, SearchRequest } from '../protocol.js';

// The capabilities that reach the remote workspace a plugin's answering tab rides, split off the main
// contract module and intersected back into `TabPluginServerCapabilities`.
export type TabPluginRemoteWorkspaceCapabilities = {
  // The change set of the remote workspace this plugin's own answering tab rides, as the far side
  // computed it — the same records a local read produces, validated by the plugin's own guard before
  // it publishes anything. Null when the answering tab rides no remote workspace, because a
  // directory that is not on another machine has no far side to ask.
  readWorkspaceChangeSet(fullFiles: readonly string[]): Promise<unknown> | null;
  // The local path one file of that remote workspace has been materialized to, answered by the same
  // cache a remote file navigator's row opens through, or null when the asking tab rides no remote
  // workspace or the file could not be read. The plugin opens that path through the routes it
  // already has, so a remote row's click is the same open a local row's is.
  materializeRemoteFile(relPath: string): Promise<string | null> | null;
  // The files of the remote workspace this plugin's own open tab rides, named by its instance key:
  // `root` is that workspace's directory on the far side and `paths` are forward-slash paths relative
  // to it, gitignore-aware, the same list a remote navigator's search uses. Null when no such tab is
  // open, it rides no remote workspace, or the channel is not ready; a failed listing rejects.
  remoteWorkspaceFileList(instanceKey: string): Promise<{ root: string; paths: string[] } | null>;
  // One file of that same workspace as UTF-8 text, or null when it is missing, larger than
  // `maxBytes`, could not be read, or the tab rides no remote workspace.
  readRemoteWorkspaceFile(instanceKey: string, relPath: string, maxBytes: number): Promise<string | null>;
  // Runs the search on the remote host and returns only matching rows. Null means the plugin tab
  // no longer rides an available remote workspace; a failed operation rejects.
  remoteWorkspaceSearch(instanceKey: string, request: SearchRequest): Promise<SearchMatch[] | null>;
  // Joins this plugin's own open tab, named by its instance key, to the remote channel the tab named
  // `sourceLabel` rides, in place: the tab keeps its label and strip position and holds the session
  // until it releases it or closes. False, changing nothing, when either tab is missing, the source
  // rides no ready channel or is reconnecting, or the own tab already rides one (release first).
  joinRemoteWorkspace(instanceKey: string, sourceLabel: string): boolean;
  // Lets this plugin's own open tab go of the channel it rides, so the session ends once nothing else
  // holds it. A tab riding nothing, or an instance key with no open tab, is left alone.
  releaseRemoteWorkspace(instanceKey: string): void;
};
