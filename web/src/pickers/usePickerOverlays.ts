import type React from 'react';
import { useMemo } from 'react';
import type { ProfileRow, RouteChooserView, TabView, TaskRow } from '@shared/protocol';
import type { PickerCommands } from '../shared/command-bar/picker-commands';
import type { JanusClient } from '../ws';
import type { CommandInputDropHandle } from '../shared/drop-handles';
import type { PluginCommandLineInsertions } from '../shared/command-bar/AppCommandBar';
import { hostsCommandBar } from '../shared/command-bar/hosts-command-bar';
import { getRecentHistory } from '../history';
import { buildOverlayOpenState } from './overlay-registry';
import type { PickerOverlaysState } from './picker/overlays-state';
import { buildPickerOverlayView, type PickerOverlayView } from './picker/overlay-view';
import { buildPickerKeyBindings, type PickerKeySnapshot, type PickerKeyCallbacks } from './picker/key-bindings';
import { useRouteChooser } from './useRouteChooser';
import { useThemePicker } from './useThemePicker';
import { useAppThemePicker } from './useAppThemePicker';
import { useHistPicker } from './useHistPicker';
import { useTabNav } from './useTabNav';
import { useQuickOpen } from './useQuickOpen';
import { useQueuePicker } from './useQueuePicker';
import { usePopulatePickers } from './usePopulatePickers';

type Input = {
  client: JanusClient;
  current: TabView | undefined;
  // The tab whose plugin bar raised the open picker, when one did. The queue and task pickers act on
  // that tab rather than on the current one, so a picker raised from a docked shell edits its queue and
  // inserts into its bar.
  sourceTab?: string;
  tabs: TabView[];
  syntaxTheme: string;
  tasks: TaskRow[];
  profiles: ProfileRow[];
  runCommand: (text: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  recallRef: React.RefObject<((text: string) => void) | null>;
  dropRef: React.RefObject<CommandInputDropHandle | null>;
  // Puts the keyboard on the harness terminal with this PTY id, after the task picker types into it.
  focusHarness: (ptyId: string) => void;
  pluginCommandLineInsertions: PluginCommandLineInsertions;
};

// The `commands` bag this hook builds, re-exported from the shared module both features name so a
// consumer can still reach the type through here.
export type { PickerCommands } from '../shared/command-bar/picker-commands';

// The route chooser's two setters and its seeding ref, plus the app theme's — what the server state
// stream writes into the overlays it drives.
export type PickerServerSetters = {
  setRoute: (route: RouteChooserView | null) => void;
  setRouteIndex: (index: number) => void;
  setTheme: (theme: string) => void;
  routeRef: React.RefObject<RouteChooserView | null>;
};

// The one owner of every modal overlay's state. Nine hooks used to be called and destructured in
// `App.tsx`, and their ~fifty results re-listed by hand three more times: as props on `AppMain` and
// again on `PickerOverlays`, as a nine-field subset inside `AppMain`'s `mountedProps`, and as the
// window key handler's snapshot and callbacks under a second set of names. Each consumer now gets one
// bag built by one function, so a field can no longer be present in one restatement and missing from
// another. The bags are separate — nothing here becomes a context, and the key handler's snapshot
// stays a plain object read through `useLatestRef` at event time.
export function usePickerOverlays(input: Input): {
  overlays: ReturnType<typeof buildOverlayOpenState>;
  route: RouteChooserView | null;
  view: PickerOverlayView;
  keys: PickerKeySnapshot & PickerKeyCallbacks;
  commands: PickerCommands;
  serverState: PickerServerSetters;
  onEditQueued: (text: string) => void;
  onDeleteQueued: () => void;
} {
  const { client, current, sourceTab, tabs, syntaxTheme, tasks, profiles, pluginCommandLineInsertions } = input;
  const { runCommand, inputRef, recallRef, dropRef, focusHarness } = input;

  // The picker lists the tab's recent history, most recent at the bottom (suppressed when empty).
  const recent = useMemo(() => getRecentHistory(current?.cmdHistory ?? [], 10), [current]);
  // The tab the queue and task pickers act on: the source tab while it is open, else the current tab.
  const pickerTab = useMemo(
    () => tabs.find((tab) => tab.label === sourceTab) ?? current,
    [tabs, sourceTab, current],
  );
  const queueItems = useMemo(() => pickerTab?.commandQueue ?? [], [pickerTab]);
  const harnessPtyId = pickerTab?.view === 'harness' ? pickerTab.harness?.ptyId : undefined;

  const route = useRouteChooser(client);
  const themes = useThemePicker(syntaxTheme, runCommand);
  const appThemes = useAppThemePicker(runCommand);
  const history = useHistPicker(recent, runCommand);
  const nav = useTabNav(client, tabs);
  const quick = useQuickOpen(client);
  const queue = useQueuePicker(client, pickerTab, inputRef, recallRef, tabs);
  const shellLabel = hostsCommandBar(pickerTab) ? pickerTab?.label : undefined;
  const populate = usePopulatePickers(
    tasks, profiles, recallRef, inputRef, client, harnessPtyId, dropRef, focusHarness,
    pluginCommandLineInsertions, shellLabel,
  );

  const overlays = buildOverlayOpenState({
    route: route.route, themePickerOpen: themes.themePickerOpen, appThemePickerOpen: appThemes.appThemePickerOpen,
    quickOpenOpen: quick.quickOpenOpen, navOpen: nav.navOpen, pickerOpen: history.pickerOpen,
    queueOpen: queue.queueOpen, taskPickerOpen: populate.taskPickerOpen, profilePickerOpen: populate.profilePickerOpen,
  });

  const state: PickerOverlaysState = {
    ...route, ...themes, ...appThemes, ...history, ...nav, ...quick, ...queue, ...populate,
    syntaxTheme, runCommand, recent, queueItems, tabs, commandInputRef: inputRef, overlays,
  };

  return {
    overlays,
    route: route.route,
    view: buildPickerOverlayView(state),
    keys: buildPickerKeyBindings(state),
    commands: {
      openPicker: history.openPicker,
      openThemePicker: themes.openThemePicker,
      openAppThemePicker: appThemes.openAppThemePicker,
      openQueue: queue.openQueue,
      openTaskPicker: populate.openTaskPicker,
      openProfilePicker: populate.openProfilePicker,
      navOpen: nav.navOpen,
      setNavOpen: nav.setNavOpen,
      openTabNavWithQuery: nav.openTabNavWithQuery,
    },
    serverState: {
      setRoute: route.setRoute,
      setRouteIndex: route.setRouteIndex,
      setTheme: appThemes.setTheme,
      routeRef: route.routeRef,
    },
    onEditQueued: queue.onEditQueued,
    onDeleteQueued: queue.onDeleteQueued,
  };
}
