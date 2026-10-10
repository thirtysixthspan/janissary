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
import { DiffSession } from './session.js';
import { parseDiffArgument } from './parse-argument.js';

// The workspace's changes as a tab. Opens on no file, so the opener is the shared refusal; everything
// it shows comes from its own git reads rather than from a host topic, because a change set is a
// question the user asks about the working tree rather than host state that changes on its own.
//
// Two routes open it, and both name a root. The `diff` command's optional path argument, empty
// meaning the originating tab's project root, opens the one project-root tab. The `on <tab name>`
// clause and the workspace button on a shell or harness tab name a workspace that already exists —
// on this machine or on the one a remote tab rides — and each workspace gets its own tab.

// What a named tab turned out to be, resolved through `originTab` with a label: the only way a plugin
// learns anything about a tab it was not invoked from.
type WorkspaceRoute =
  | { kind: 'local'; origin: { root: string; workspace: { dir: string } } }
  | { kind: 'remote'; origin: { root: string; workspace: { dir: string } } }
  | { kind: 'provisioning' }
  | { kind: 'none' };

function resolveWorkspace(
  capabilities: TabPluginServerCapabilities, name: string,
): WorkspaceRoute {
  const record = capabilities.originTab(name);
  // The directory of a clone is known before the clone is, so a workspace that has not landed reads
  // as one that exists — and asking for its diff would answer "not a git repository" for what is
  // really a wait.
  if (record?.provisioning) return { kind: 'provisioning' };
  if (record?.workspace) {
    const origin = { root: record.root, workspace: { dir: record.workspace.dir } };
    return { kind: record.remote ? 'remote' : 'local', origin };
  }
  return { kind: 'none' };
}

// The one place a workspace becomes a tab. The command's clause resolves the tab it named here; the
// metadata row's button and the sessions row's button arrive with their tab already resolved by the
// host, which is the same record read without a label.
function openWorkspace(
  session: DiffSession, tab: string,
  route: { kind: 'local' | 'remote'; origin: { root: string; workspace: { dir: string } } },
): void {
  if (route.kind === 'remote') {
    session.openRemoteWorkspace({ tab, ...route.origin }, tab);
    return;
  }
  session.openWorkspace({ tab, ...route.origin });
}

export function activate(): TabPluginActivation {
  // Built on first use and closed over by every handler, so the tabs' identity, their roots, and the
  // recomputes in flight are one object with the lifetime of the plugin.
  let session: DiffSession | null = null;
  const sessionFor = (capabilities: TabPluginServerCapabilities): DiffSession => {
    session ??= new DiffSession(capabilities);
    return session;
  };

  // The root a `diff [path]` argument names, resolved against the originating tab's project root and
  // refused when it escapes it or is not a directory. The second refusal matters: a path that does
  // not exist fails git's own reads for the same reason a non-repository does, which would report
  // "not a git repository" for what is really a typo.
  const rootFor = (argument: string, origin: { root: string }, capabilities: TabPluginServerCapabilities): string => {
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
      const parsed = parseDiffArgument(argument);
      if ('error' in parsed) return capabilities.rejectRequest(parsed.error);
      const active = sessionFor(capabilities);
      if (parsed.tab !== undefined) {
        const route = resolveWorkspace(capabilities, parsed.tab);
        if (route.kind === 'none') {
          return capabilities.rejectRequest(
            `Cannot diff on <${parsed.tab}>: no open shell or harness tab named "${parsed.tab}" has a workspace.`,
          );
        }
        if (route.kind === 'provisioning') {
          return capabilities.rejectRequest(
            `Cannot diff on <${parsed.tab}>: the workspace of "${parsed.tab}" is still being prepared.`,
          );
        }
        openWorkspace(active, parsed.tab, route);
        return;
      }
      const root = rootFor(parsed.path, origin, capabilities);
      if (root === '') return;
      active.open(root, origin);
    },
    // Another tab's workspace button, and the sessions row's button: the diff tab opens on that
    // tab's own environment, and does nothing when the tab has no workspace to diff.
    openSibling(capabilities) {
      const origin = capabilities.originTab();
      if (!origin?.workspace) return;
      const route = {
        kind: origin.remote ? 'remote' as const : 'local' as const,
        origin: { root: origin.root, workspace: { dir: origin.workspace.dir } },
      };
      openWorkspace(sessionFor(capabilities), origin.label, route);
    },
    intent: defineIntents('diff', isDiffPayload, {
      // The recompute is started rather than awaited, and the answer is `null`: an intent's result is
      // sent to the waiting client and must be JSON-compatible, so a handler that resolves to
      // `undefined` disables this plugin — and a recompute that ran several git processes would spend
      // the handler's whole budget doing it. The tab repaints itself when the diff lands.
      refresh: {
        payload: isRefreshIntent,
        run: (tab, _payload: RefreshIntent, capabilities) => {
          void sessionFor(capabilities).refresh(tab.instanceKey, capabilities);
          return null;
        },
      },
      // The layout the user chose. The session republishes every open tab with it and remembers it in
      // the plugin's settings entry, so every diff tab after this one opens the same way.
      layout: {
        payload: isLayoutIntent,
        run: (_tab, payload: LayoutIntent, capabilities) => {
          sessionFor(capabilities).saveLayout(payload.split);
          return null;
        },
      },
      context: {
        payload: isContextIntent,
        run: (tab, payload: ContextIntent, capabilities) => {
          sessionFor(capabilities).setFullFile(tab.instanceKey, payload.path, payload.fullFile);
          return null;
        },
      },
      open: {
        payload: isOpenIntent,
        run: (tab, payload: OpenIntent, capabilities) => {
          sessionFor(capabilities).openFile(tab.instanceKey, payload.path, payload.line);
          return null;
        },
      },
      'open-media': {
        payload: isOpenMediaIntent,
        run: (tab, payload: OpenMediaIntent, capabilities) => {
          sessionFor(capabilities).openMedia(tab.instanceKey, payload.path);
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
