import {
  defineIntents,
  noFileOpener,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import {
  isOpenIntent,
  isSearchIntent,
  isSearchPayload,
  type OpenIntent,
  type SearchIntent,
} from './shared.js';
import { SearchSession } from './session.js';
import type { ScanRead } from './scan.js';

// Repository-wide search. Opens on no file, so the opener is the shared refusal; everything it shows
// comes from its own scan rather than from a host topic, because a search is a question the user
// asks rather than host state that changes on its own.
//
// `readFile` exists so a test can supply file contents without a filesystem; production reads the
// real file, which is the only route a result's text can come from.
export function activate(readFile?: ScanRead): TabPluginActivation {
  // Built on first use and closed over by every handler, so the scan in flight, the rows accumulated
  // so far, and the tab identity are one object with the lifetime of the plugin.
  let session: SearchSession | null = null;
  const sessionFor = (capabilities: TabPluginServerCapabilities): SearchSession => {
    session ??= new SearchSession(capabilities, readFile);
    return session;
  };

  return {
    isPayload: isSearchPayload,
    // `search <query>` opens the tab and starts a scan; `search` alone opens or focuses it.
    command(argument, capabilities) {
      sessionFor(capabilities).open(argument);
    },
    intent: defineIntents('search', isSearchPayload, {
      search: {
        payload: isSearchIntent,
        run: (_tab, payload: SearchIntent, capabilities) => {
          sessionFor(capabilities).run(payload);
          return null;
        },
      },
      open: {
        payload: isOpenIntent,
        run: (_tab, payload: OpenIntent, capabilities) => {
          sessionFor(capabilities).openMatch(payload.path, payload.line);
          return null;
        },
      },
    }),
    opener: noFileOpener('search'),
    dispose() {
      session?.dispose();
      session = null;
    },
  };
}
