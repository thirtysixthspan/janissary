import type { Managers } from '../managers.js';
import { getConfig } from '../config.js';
import { didOsOpen } from '../openers/os-open.js';
import {
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
  type TabPluginNotificationTopic,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import { projectFilesFor } from '../project/files.js';
import { isInsideRoot } from './files.js';
import { readPluginSettings, savePluginSettings } from './settings.js';
import { liveRecordingPaths } from './live-recordings.js';
import { emptyTopicData, readTopicData, runTopicAction } from './topics.js';
import { tabActivityRows } from './activity.js';
import { isJsonCompatible } from './json-compatible.js';

// The capabilities a plugin reaches files, settings, and the outside world through. One group
// because they are one concern — what a plugin may touch beyond its own tabs — and because each
// needs the same four facts. Split out of `context.ts` for the same reason `lineCapabilities` and
// `acpCapabilities` were: that module composes the capability set, and a group that shares nothing
// with the rest belongs beside it rather than inside it.
export function fileCapabilities(input: {
  managers: Managers;
  declaration: TabPluginDeclaration;
  origin: PluginFailureOrigin;
  isEnabled: () => boolean;
  // Collects `openClaimedFiles` targets for the host to run once the guarded call has returned.
  openRequests: string[];
}): Pick<
  TabPluginServerCapabilities,
  'topicData' | 'tabActivity' | 'topicAction' | 'openClaimedFiles' | 'projectFileList'
  | 'openInEditor' | 'configuredViewer' | 'openExternally' | 'readSettings' | 'saveSettings'
  | 'isRecordingLive'
> {
  const { managers, declaration, origin, isEnabled, openRequests } = input;
  return {
    topicData: (topic) => {
      requireDeclaredTopic(declaration, topic);
      return isEnabled() ? readTopicData(managers, topic) : emptyTopicData(topic);
    },
    // The host's open tabs. Unlike `topicData` this is host-wide rather than one subsystem's slice,
    // because the question a summarizer asks is "what is the application doing", which no single tab
    // speaks for. The transcript tails are opt-in per call, so a plugin that only lists tabs reads no
    // other tab's output at all.
    tabActivity: (tailLines) => (isEnabled() ? tabActivityRows(managers, tailLines) : []),
    topicAction: (action) => {
      requireDeclaredTopic(declaration, action.topic);
      if (isEnabled()) runTopicAction(managers, action);
    },
    // The plugin's own claimed extensions, expanded by the host's own glob rules and dispatched
    // after the guarded call returns, so a plugin never waits on a large wildcard open. The target is
    // collected here rather than expanded here for the same reason: the host owns the dispatch, and
    // a plugin's call budget must not carry a project-wide glob.
    openClaimedFiles: (target) => {
      if (!isEnabled()) return;
      openRequests.push(target);
    },
    // The same gitignore-aware file list the `projectFiles` RPC already serves to Quick Open, so a
    // plugin that scans the repository cannot drift from the set Quick Open searches. The root comes
    // back alongside the paths because a relative path is not a path a plugin can open without it.
    projectFileList: () => {
      if (!isEnabled()) return Promise.resolve({ root: '', paths: [] });
      return projectFilesFor(managers);
    },
    // Opens a file in an editor tab with the cursor on `line`, through the ordinary `edit` pipeline —
    // so the tab is de-duplicated, the line is centered, and the file is served by the same
    // authenticated `/open/<id>` allow-list as any other editor open. Deliberately not
    // `openClaimedFiles`, which is pinned to the plugin's own extensions and cannot express a line.
    //
    // A path outside the launch directory is refused. The capability is this plugin's whole reach
    // over the filesystem, so the boundary belongs here rather than in each plugin that asks: a
    // plugin holding one could otherwise name any path on the machine and have it opened and served.
    openInEditor: (absPath, line) => {
      if (!isEnabled()) return;
      if (!isInsideRoot(managers.tab.launchDir, absPath)) return;
      managers.openFile.edit(`${declaration.id} ${absPath}:${line}`, absPath, origin.label, line);
    },
    configuredViewer: () => isEnabled() ? getConfig().externalViewers?.[declaration.id] ?? '' : '',
    openExternally: (absPath, application) => isEnabled() && didOsOpen(absPath, application),
    readSettings: () => isEnabled() ? readPluginSettings(declaration.id) : {},
    saveSettings: (settings) => {
      if (!isSettingsObject(settings)) throw new Error('saved settings that are not a JSON object');
      return isEnabled() && savePluginSettings(declaration.id, settings);
    },
    // True only while an open tab's recorder is still writing this very file. The host owns the
    // recorders, so the host is what answers; a plugin reaches no tab list of its own to ask.
    isRecordingLive: (absPath) => isEnabled() && liveRecordingPaths(managers).has(absPath),
  };
}

// Reading or acting on a topic the manifest never named reaches past the declaration exactly as
// using an undeclared capability does, so it fails the same way: an ordinary error across the
// failure boundary rather than a rejection the caller could have avoided.
function requireDeclaredTopic(
  declaration: TabPluginDeclaration,
  topic: TabPluginNotificationTopic,
): void {
  if (!(declaration.notifications ?? []).includes(topic)) {
    throw new Error(`used topic "${topic}" without declaring it`);
  }
}

// A saved-settings value has to be a plain JSON object, because it is written straight into
// `.janissary/config.json` under this plugin's own key. An object carrying a cycle or a function
// could never be written back, so it is refused as the plugin bug it is rather than coerced.
function isSettingsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && isJsonCompatible(value);
}
