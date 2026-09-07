import type React from 'react';
import { useMemo } from 'react';
import type { ProfileRow, RouteChooserView, TabView, TaskRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import type { CommandInputDropHandle } from '../drop-handles';
import { getRecentHistory } from '../history';
import { buildOverlayOpenState } from './overlay-registry';
import type { PickerOverlaysState } from './picker-overlays-state';
import { buildPickerOverlayView, type PickerOverlayView } from './picker-overlay-view';
import { buildPickerKeyBindings, type PickerKeySnapshot, type PickerKeyCallbacks } from './picker-key-bindings';
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
  tabs: TabView[];
  syntaxTheme: string;
  tasks: TaskRow[];
  janissaryTasksDir: string;
  profiles: ProfileRow[];
  runCommand: (text: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  recallRef: React.RefObject<((text: string) => void) | null>;
  dropRef: React.RefObject<CommandInputDropHandle | null>;
};

// The openers the command bar intercepts: typing `hist`, `theme`, `queue`, `tasks`, `nav …` opens
// the matching overlay instead of reaching the server.
export type PickerCommands = {
  openPicker: () => void;
  openThemePicker: () => void;
  openAppThemePicker: () => void;
  openQueue: () => void;
  openTaskPicker: () => void;
  openProfilePicker: () => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  openTabNavWithQuery: (query: string) => void;
};

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
  const { client, current, tabs, syntaxTheme, tasks, janissaryTasksDir, profiles } = input;
  const { runCommand, inputRef, recallRef, dropRef } = input;

  // The picker lists the tab's recent history, most recent at the bottom (suppressed when empty).
  const recent = useMemo(() => getRecentHistory(current?.cmdHistory ?? [], 10), [current]);
  const queueItems = useMemo(() => current?.commandQueue ?? [], [current]);
  const harnessPtyId = current?.view === 'harness' ? current.harness?.ptyId : undefined;

  const route = useRouteChooser(client);
  const themes = useThemePicker(syntaxTheme, runCommand);
  const appThemes = useAppThemePicker(runCommand);
  const history = useHistPicker(recent, runCommand);
  const nav = useTabNav(client, tabs);
  const quick = useQuickOpen(client);
  const queue = useQueuePicker(client, current, inputRef, recallRef);
  const populate = usePopulatePickers(
    tasks, janissaryTasksDir, profiles, recallRef, inputRef, client, harnessPtyId, dropRef,
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
