import path from 'node:path';
import { statSync } from 'node:fs';
import {
  defineIntents,
  noFileOpener,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import { isInsideRoot } from '../files.js';
import {
  isDiffPayload,
  isLayoutIntent,
  isOpenIntent,
  isOpenMediaIntent,
  isRefreshIntent,
  isContextIntent,
  type LayoutIntent,
  type OpenIntent,
  type OpenMediaIntent,
  type RefreshIntent,
  type ContextIntent,
} from './shared.js';
import { DiffSession, type DiffOrigin } from './session.js';

// The workspace's changes as a tab. Opens on no file, so the opener is the shared refusal; everything
// it shows comes from its own git reads rather than from a host topic, because a change set is a
// question the user asks about the working tree rather than host state that changes on its own.
//
// Only a claimed `diff` command or another tab's workspace button opens it. Both name a root: the
// command's optional path argument, empty meaning the originating tab's project root, or the opening
// tab's workspace directory.

export function activate(): TabPluginActivation {
  // Built on first use and closed over by every handler, so the tab's identity, its root, and the
  // recompute in flight are one object with the lifetime of the plugin.
  let session: DiffSession | null = null;
  const sessionFor = (capabilities: TabPluginServerCapabilities): DiffSession => {
    session ??= new DiffSession(capabilities);
    return session;
  };

  // The root a `diff [path]` argument names, resolved against the originating tab's project root and
  // refused when it escapes it or is not a directory. The second refusal matters: a path that does
  // not exist fails git's own reads for the same reason a non-repository does, which would report
  // "not a git repository" for what is really a typo.
  const rootFor = (argument: string, origin: DiffOrigin, capabilities: TabPluginServerCapabilities): string => {
    const trimmed = argument.trim();
    if (trimmed === '') return origin.root;
    const resolved = path.resolve(origin.root, trimmed);
    if (!isInsideRoot(origin.root, resolved)) {
      capabilities.rejectRequest(`Cannot diff <${trimmed}>: it is outside the project root <${origin.root}>.`);
    }
    if (statSync(resolved, { throwIfNoEntry: false })?.isDirectory() !== true) {
      capabilities.rejectRequest(`Cannot diff <${trimmed}>: no such directory.`);
    }
    return resolved;
  };

  return {
    isPayload: isDiffPayload,
    command(argument, capabilities) {
      const origin = capabilities.originTab();
      if (!origin) return;
      const root = rootFor(argument, origin, capabilities);
      if (root === '') return;
      sessionFor(capabilities).open(root, origin);
    },
    // Another tab's workspace button: the diff tab opens on that tab's own environment, and does
    // nothing when the tab has no workspace to diff.
    openSibling(capabilities) {
      const workspace = capabilities.originTab()?.workspace?.dir;
      if (workspace === undefined) return;
      const origin = capabilities.originTab();
      if (!origin) return;
      sessionFor(capabilities).open(workspace, origin);
    },
    intent: defineIntents('diff', isDiffPayload, {
      // The recompute is started rather than awaited, and the answer is `null`: an intent's result is
      // sent to the waiting client and must be JSON-compatible, so a handler that resolves to
      // `undefined` disables this plugin — and a recompute that ran several git processes would spend
      // the handler's whole budget doing it. The tab repaints itself when the diff lands.
      refresh: {
        payload: isRefreshIntent,
        run: (_tab, _payload: RefreshIntent, capabilities) => {
          void sessionFor(capabilities).refresh();
          return null;
        },
      },
      // The layout the user chose. The session republishes the tab with it and remembers it in the
      // plugin's settings entry, so every diff tab after this one opens the same way.
      layout: {
        payload: isLayoutIntent,
        run: (_tab, payload: LayoutIntent, capabilities) => {
          sessionFor(capabilities).layout(payload.split);
          return null;
        },
      },
      context: {
        payload: isContextIntent,
        run: (_tab, payload: ContextIntent, capabilities) => {
          sessionFor(capabilities).setFullFile(payload.path, payload.fullFile);
          return null;
        },
      },
      open: {
        payload: isOpenIntent,
        run: (_tab, payload: OpenIntent, capabilities) => {
          sessionFor(capabilities).openFile(payload.path, payload.line);
          return null;
        },
      },
      'open-media': {
        payload: isOpenMediaIntent,
        run: (_tab, payload: OpenMediaIntent, capabilities) => {
          sessionFor(capabilities).openMedia(payload.path);
          return null;
        },
      },
    }),
    opener: noFileOpener('diff'),
    dispose() {
      session?.dispose();
      session = null;
    },
  };
}
