import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JanusClient } from './ws';
import type { TabView, RouteChooserView, HarnessLaunchView, ScheduleLaunchView, TaskRow, ProfileRow } from '@shared/protocol';
import { AppMain } from './AppMain';
import type { CommandInputDropHandle } from './CommandInput';
import type { EditorTabHandle, EditorDropHandle } from './EditorTab';
import { useTabHandles } from './useTabHandles';
import { useTabNav } from './useTabNav';
import { useQuickOpen } from './useQuickOpen';
import { useQueuePicker } from './useQueuePicker';
import { usePopulatePickers } from './usePopulatePickers';
import { useCommandBarSubmit } from './useCommandBarSubmit';
import { useUnsavedQuitGuard } from './useUnsavedQuitGuard';
import { useFocusOnTabSwitch, focusCenterVisibleTab } from './useFocusOnTabSwitch';
import { useSectionNav } from './useSectionNav';
import { useTabEntries } from './useTabEntries';
import { useViewSearchState } from './useViewSearchState';
import { getRecentHistory } from './history';
import { useCmdW } from './useCmdW';
import { useTranscriptScroll } from './useTranscriptScroll';
import { useQuitConfirm } from './QuitDialog/useQuitConfirm';
import { useAppWindowKeys } from './useAppWindowKeys';
import { useThemePicker } from './useThemePicker';
import { useAppThemePicker } from './useAppThemePicker';
import { useHistPicker } from './useHistPicker';
import { useServerState, useTabNameLimits } from './useServerState';
import { useLayoutState } from './useLayoutState';
import { applySyntaxTheme } from './editor/highlight/themes';
import { useWindowFocus } from './useWindowFocus';
import { useCmdWRefs } from './useCmdWRefs';
import { collectNavigatorSelections } from './file-navigator/file-navigator-selection-registry';

export function App() {
  const clientReference = useRef<JanusClient | null>(null);
  clientReference.current ??= new JanusClient();
  const client = clientReference.current;

  const [tabs, setTabs] = useState<TabView[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [secondaryTab, setSecondaryTab] = useState<number>();
  const { tabNameMaxLength, setTabNameMaxLength, activeTabNameMaxLength, setActiveTabNameMaxLength } = useTabNameLimits();
  const [globalHistory, setGlobalHistory] = useState<string[]>([]);
  const [syntaxTheme, setSyntaxTheme] = useState('github-dark');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [janissaryTasksDir, setJanissaryTasksDir] = useState('');
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  // Server-driven route chooser (null when closed); `routeIdx` is the highlighted option.
  const [route, setRoute] = useState<RouteChooserView | null>(null);
  // Server-driven "New harness" launch dialog (null when closed).
  const [harnessLaunch, setHarnessLaunch] = useState<HarnessLaunchView | null>(null);
  // Server-driven "New schedule" dialog (null when closed).
  const [scheduleLaunch, setScheduleLaunch] = useState<ScheduleLaunchView | null>(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const routeReference = useRef<RouteChooserView | null>(null);
  const inputReference = useRef<HTMLTextAreaElement>(null);
  // Assigned `CommandInput`'s `recall` (the `guardRef` pattern); shared by the queue and task
  // pickers so a selected row's text lands in the command line without submitting.
  const recallReference = useRef<((text: string) => void) | null>(null);
  // Assigned `CommandInput`'s insert-at-caret/highlight pair (the `guardRef` pattern) so a
  // file-navigator drag, threaded down the sidebar's own branch of the tree, can insert a dropped path
  // into whichever tab's command bar is currently rendered here.
  const dropReference = useRef<CommandInputDropHandle | null>(null);
  // Same imperative-escape-hatch pattern as `dropReference`, but targeting whichever editor tab
  // is currently active — set by `EditorTab` itself during its own render (see `MountedViewLayers`).
  const editorDropReference = useRef<EditorDropHandle | null>(null);
  const transcriptReference = useRef<HTMLDivElement>(null);
  const { harnessHandles, shellHandles, questionPanelRef } = useTabHandles();
  const currentRef = useRef<TabView | undefined>(undefined);
  const { handleScrollKey, handleScrollKeyUp } = useTranscriptScroll(transcriptReference);
  const windowFocused = useWindowFocus();

  const { actionEntries, reportingEntries } = useTabEntries(tabs);
  const {
    sidebarLeftWidth, setSidebarLeftWidth, sidebarRightWidth, setSidebarRightWidth, reportingHeightPct, setReportingHeightPct,
    focusLeft, focusRight,
  } = useLayoutState(client);

  const current = tabs[activeTab] ?? actionEntries[0]?.tab;
  currentRef.current = current;
  const lines = useMemo(() => current?.bufferLines ?? [], [current]);
  // The picker lists the tab's recent history, most recent at the bottom (suppressed when empty).
  const recent = useMemo(() => getRecentHistory(current?.cmdHistory ?? [], 10), [current]);

  const { canSearch, search, highlight } = useViewSearchState(current, lines);

  const runCommand = useCallback((text: string) => client.send({ method: 'command', params: { text } }), [client]);
  const { themePickerOpen, themePickerIndex, setThemePickerIndex, setThemePickerOpen, openThemePicker, pickTheme } =
    useThemePicker(syntaxTheme, runCommand);
  const {
    theme, setTheme, appThemePickerOpen, appThemePickerIndex, setAppThemePickerIndex, setAppThemePickerOpen, openAppThemePicker, pickAppTheme,
  } = useAppThemePicker(runCommand);
  const { pickerOpen, pickerIndex, setPickerIndex, setPickerOpen, openPicker, pick } = useHistPicker(recent, runCommand);
  const {
    navOpen, navQuery, navIndex, navTabs, setNavIndex, setNavQuery, setNavOpen, openTabNav, openTabNavWithQuery, selectNavTab,
  } = useTabNav(client, tabs);
  const {
    quickOpenOpen, quickOpenQuery, quickOpenIndex, quickOpenLoading, quickOpenResults,
    setQuickOpenQuery, setQuickOpenIndex, openQuickOpen, closeQuickOpen, pickQuickOpenFile,
  } = useQuickOpen(client);

  const {
    queueOpen, queueIndex, setQueueIndex, setQueueOpen, openQueue, selectQueueIndex, onEditQueued, onDeleteQueued,
  } = useQueuePicker(client, current, inputReference, recallReference);
  const {
    taskPickerOpen, taskPickerIndex, setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask, visibleTasks, toggleTaskDir,
    profilePickerOpen, profilePickerIndex, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile, visibleProfiles,
  } = usePopulatePickers(
    tasks, janissaryTasksDir, profiles, recallReference, inputReference, client,
    current?.view === 'harness' ? current.harness?.ptyId : undefined, dropReference,
  );

  const { quitConfirmOpen, openQuitConfirm, confirmQuit, cancelQuit } = useQuitConfirm(runCommand, inputReference);
  // Every dirty-capable tab handle, editor and plugin alike, keyed by tab label. The close guard,
  // the quit guard, and the editor focus path all reach a tab through this one map.
  const tabHandles = useRef<Map<string, EditorTabHandle>>(new Map());
  // The labels of plugin tabs holding unsaved work. A ref cannot drive a render, so the strip's
  // marker reads this instead — a plugin re-registers its handle whenever its answer changes.
  const [dirtyPluginTabs, setDirtyPluginTabs] = useState<ReadonlySet<string>>(new Set());
  const onPluginDirty = useCallback((label: string, dirty: boolean) => {
    setDirtyPluginTabs((previous) => {
      if (previous.has(label) === dirty) return previous;
      const next = new Set(previous);
      if (dirty) next.add(label); else next.delete(label);
      return next;
    });
  }, []);
  const { unsavedQuitOpen, guardedOpenQuitConfirm, confirmUnsavedQuit, cancelUnsavedQuit } =
    useUnsavedQuitGuard(tabs, tabHandles, openQuitConfirm, runCommand);
  const guardRef = useRef<((index: number) => boolean) | null>(null);
  const { activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef } = useCmdWRefs(
    activeTab, quitConfirmOpen, unsavedQuitOpen, pickerOpen, queueOpen, taskPickerOpen, profilePickerOpen, route,
  );

  const closeTab = useCallback((index: number) => {
    if (tabs.filter((t) => !t.dock).length === 1) { guardedOpenQuitConfirm(); return; }
    if (guardRef.current?.(index)) return; client.send({ method: 'closeTab', params: { index } });
  }, [client, tabs, guardedOpenQuitConfirm]);

  const chooseRoute = useCallback((index: number) => client.send({ method: 'chooseRoute', params: { index } }), [client]);

  useServerState(client, {
    setTabs, setActiveTab, setSecondaryTab, setRoute, setHarnessLaunch, setScheduleLaunch,
    setTabNameMaxLength, setActiveTabNameMaxLength, setGlobalHistory, setSyntaxTheme, setTheme,
    setTasks, setJanissaryTasksDir, setProfiles, setRouteIndex,
    routeRef: routeReference,
  });

  useEffect(() => { applySyntaxTheme(syntaxTheme); }, [syntaxTheme]);

  // The file navigator's selections are client-only React state, so the app shell — not the
  // protocol client — is what tells the client where to read them from when the server asks.
  useEffect(
    () => client.registerStateCollector('fileNavigatorSelections', collectNavigatorSelections),
    [client],
  );

  useFocusOnTabSwitch(activeTab, currentRef, harnessHandles, shellHandles, inputReference, questionPanelRef);

  useSectionNav(tabs, () => focusCenterVisibleTab(currentRef.current, harnessHandles, shellHandles, inputReference));

  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef);

  // Live snapshot + callbacks read by the window key handler, so it never has to re-register.
  useAppWindowKeys(client, handleScrollKey, handleScrollKeyUp, {
    pickerOpen, pickerIdx: pickerIndex, recent, route, routeIdx: routeIndex, canSearch, searchOpen: search.searchOpen,
    themePickerOpen, themePickerIdx: themePickerIndex, appThemePickerOpen, appThemePickerIdx: appThemePickerIndex,
    navOpen, navQuery, navIdx: navIndex, navTabs, queueOpen, queueIdx: queueIndex, queueItems: current?.commandQueue ?? [],
    taskPickerOpen, taskPickerIdx: taskPickerIndex, visibleTasks,
    profilePickerOpen, profilePickerIdx: profilePickerIndex, profiles: visibleProfiles,
    quickOpenOpen,
    setRouteIndex, chooseRoute, runCommand, setPickerIndex, setPickerOpen, openPicker, openSearch: () => search.open(''),
    setThemePickerIndex, setThemePickerOpen, pickTheme, setAppThemePickerIndex, setAppThemePickerOpen, pickAppTheme,
    setNavIndex, setNavQuery, selectNavTab, setNavOpen, openTabNav,
    setQueueIndex, setQueueOpen, openQueue,
    setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask, toggleTaskDir, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile,
    openQuickOpen,
  });

  const onCommandBarSubmit = useCommandBarSubmit({
    canSearch, lines, search, openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker, navOpen, setNavOpen,
    openTabNavWithQuery, tabs, openQuitConfirm: guardedOpenQuitConfirm, guardRef, activeTab, runCommand,
  });

  if (!current) return <div className="app" style={{ padding: 16, color: 'var(--muted)' }}>Connecting…</div>;

  return (
    <AppMain
      current={current} client={client} lines={lines} runCommand={runCommand}
      transcriptReference={transcriptReference} highlight={highlight} inputReference={inputReference}
      route={route} routeIndex={routeIndex} chooseRoute={chooseRoute}
      syntaxTheme={syntaxTheme} themePickerOpen={themePickerOpen} themePickerIndex={themePickerIndex} pickTheme={pickTheme}
      theme={theme} appThemePickerOpen={appThemePickerOpen} appThemePickerIndex={appThemePickerIndex} pickAppTheme={pickAppTheme}
      pickerOpen={pickerOpen} recent={recent} pickerIndex={pickerIndex} pick={pick}
      navOpen={navOpen} navQuery={navQuery} navIndex={navIndex} tabs={tabs} selectNavTab={selectNavTab}
      queueOpen={queueOpen} queueIndex={queueIndex} selectQueueIndex={selectQueueIndex}
      taskPickerOpen={taskPickerOpen} visibleTasks={visibleTasks} taskPickerIndex={taskPickerIndex} pickTask={pickTask} toggleTaskDir={toggleTaskDir}
      profilePickerOpen={profilePickerOpen} profiles={visibleProfiles} profilePickerIndex={profilePickerIndex} pickProfile={pickProfile}
      quickOpenOpen={quickOpenOpen} quickOpenQuery={quickOpenQuery} setQuickOpenQuery={setQuickOpenQuery}
      quickOpenResults={quickOpenResults} quickOpenIndex={quickOpenIndex} setQuickOpenIndex={setQuickOpenIndex}
      quickOpenLoading={quickOpenLoading} pickQuickOpenFile={pickQuickOpenFile} closeQuickOpen={closeQuickOpen}
      search={search} globalHistory={globalHistory} onCommandBarSubmit={onCommandBarSubmit}
      quitConfirmOpen={quitConfirmOpen} unsavedQuitOpen={unsavedQuitOpen}
      recallReference={recallReference} onEditQueued={onEditQueued} onDeleteQueued={onDeleteQueued}
      dropRef={dropReference}
      activeTab={activeTab} secondaryTab={secondaryTab} windowFocused={windowFocused}
      actionEntries={actionEntries} reportingEntries={reportingEntries} closeTab={closeTab}
      tabNameMaxLength={tabNameMaxLength} activeTabNameMaxLength={activeTabNameMaxLength}
      sidebarLeftWidth={sidebarLeftWidth} setSidebarLeftWidth={setSidebarLeftWidth}
      sidebarRightWidth={sidebarRightWidth} setSidebarRightWidth={setSidebarRightWidth}
      reportingHeightPct={reportingHeightPct} setReportingHeightPct={setReportingHeightPct}
      focusLeft={focusLeft} focusRight={focusRight}
      harnessHandles={harnessHandles} shellHandles={shellHandles} questionPanelRef={questionPanelRef}
      tabHandles={tabHandles} editorDropReference={editorDropReference}
      dirtyPluginTabs={dirtyPluginTabs} onPluginDirty={onPluginDirty}
      harnessLaunch={harnessLaunch} scheduleLaunch={scheduleLaunch}
      confirmQuit={confirmQuit} cancelQuit={cancelQuit}
      confirmUnsavedQuit={confirmUnsavedQuit} cancelUnsavedQuit={cancelUnsavedQuit}
      guardRef={guardRef}
    />
  );
}
