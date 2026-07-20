import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JanusClient } from './ws';
import type { TabView, RouteChooserView, HarnessLaunchView, ScheduleLaunchView, TaskRow } from '@shared/protocol';
import { HarnessLaunchDialog } from './HarnessLaunchDialog';
import { ScheduleDialog } from './ScheduleDialog';
import { TabStrip } from './TabStrip';
import { ViewTabBody } from './ViewTabBody';
import { ReportingSection } from './ReportingSection';
import { AppShell } from './AppShell';
import type { CommandInputDropHandle } from './CommandInput';
import type { HarnessTabHandle } from './HarnessTab';
import type { EditorTabHandle } from './EditorTab';
import type { ShellTabHandle } from './ShellTab';
import { ShellTabLayer } from './ShellTabLayer';
import { MountedViewLayers } from './MountedViewLayers';
import { useTabNav } from './useTabNav';
import { useQuickOpen } from './useQuickOpen';
import { useQueuePicker } from './useQueuePicker';
import { usePopulatePickers } from './usePopulatePickers';
import { useCommandBarSubmit } from './useCommandBarSubmit';
import { QuitDialog } from './QuitDialog/QuitDialog';
import { UnsavedQuitDialog } from './UnsavedQuitDialog';
import { CloseSaveGuard } from './CloseSaveGuard';
import { useUnsavedQuitGuard } from './useUnsavedQuitGuard';
import { useFocusOnTabSwitch, focusCenterVisibleTab } from './useFocusOnTabSwitch';
import { useSectionNav } from './useSectionNav';
import { useTabEntries } from './useTabEntries';
import { useViewSearchState } from './useViewSearchState';
import { getRecentHistory } from './history';
import { useCmdW } from './useCmdW';
import { AgentTabBody } from './AgentTabBody';
import { useTranscriptScroll } from './useTranscriptScroll';
import { useQuitConfirm } from './QuitDialog/useQuitConfirm';
import { useAppWindowKeys } from './useAppWindowKeys';
import { useThemePicker } from './useThemePicker';
import { useAppThemePicker } from './useAppThemePicker';
import { useHistPicker } from './useHistPicker';
import { useServerState } from './useServerState';
import { useLayoutState } from './useLayoutState';
import { applySyntaxTheme } from './editor/highlight/themes';
import { useWindowFocus } from './useWindowFocus';
import { useCmdWRefs } from './useCmdWRefs';

export function App() {
  const clientReference = useRef<JanusClient | null>(null);
  clientReference.current ??= new JanusClient();
  const client = clientReference.current;

  const [tabs, setTabs] = useState<TabView[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [tabNameMaxLength, setTabNameMaxLength] = useState(16);
  const [globalHistory, setGlobalHistory] = useState<string[]>([]);
  const [syntaxTheme, setSyntaxTheme] = useState('github-dark');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [janissaryTasksDir, setJanissaryTasksDir] = useState('');
  const [profiles, setProfiles] = useState<string[]>([]);
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
  // file-tree drag, threaded down the sidebar's own branch of the tree, can insert a dropped path
  // into whichever tab's command bar is currently rendered here.
  const dropReference = useRef<CommandInputDropHandle | null>(null);
  const transcriptReference = useRef<HTMLDivElement>(null);
  const harnessHandles = useRef<Map<string, HarnessTabHandle>>(new Map());
  const shellHandles = useRef<Map<string, ShellTabHandle>>(new Map());
  const currentRef = useRef<TabView | undefined>(undefined);
  const { handleScrollKey, handleScrollKeyUp } = useTranscriptScroll(transcriptReference);
  const windowFocused = useWindowFocus();

  const { actionEntries, reportingEntries } = useTabEntries(tabs);
  const {
    sidebarLeftWidth, setSidebarLeftWidth, sidebarRightWidth, setSidebarRightWidth, reportingHeightPct, setReportingHeightPct,
  } = useLayoutState(client);

  const current = tabs[activeTab] ?? actionEntries[0]?.tab;
  // `current`'s real index in the server's tab list — usually `activeTab`, but that can point
  // past the end transiently (e.g. right after closing the last tab, before new state arrives),
  // in which case `current` falls back to the first action tab and this must follow it.
  const currentIndex = activeTab < tabs.length ? activeTab : (actionEntries[0]?.index ?? 0);
  currentRef.current = current;
  const lines = useMemo(() => current?.bufferLines ?? [], [current]);
  // The picker lists the tab's recent history, most recent at the bottom (suppressed when empty).
  const recent = useMemo(() => getRecentHistory(current?.cmdHistory ?? [], 10), [current]);

  const { isViewTab, canSearch, search, highlight } = useViewSearchState(current, lines);

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
    taskPickerOpen, taskPickerIndex, setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask, visibleTasks, toggleTaskDir, profilePickerOpen, profilePickerIndex, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile,
  } = usePopulatePickers(tasks, janissaryTasksDir, recallReference, inputReference, client, current?.view === 'harness' ? current.harness?.ptyId : undefined, dropReference);

  const { quitConfirmOpen, openQuitConfirm, confirmQuit, cancelQuit } = useQuitConfirm(runCommand, inputReference);
  const editorHandles = useRef<Map<string, EditorTabHandle>>(new Map());
  const { unsavedQuitOpen, guardedOpenQuitConfirm, confirmUnsavedQuit, cancelUnsavedQuit } =
    useUnsavedQuitGuard(tabs, editorHandles, openQuitConfirm, runCommand);
  const guardRef = useRef<((index: number) => boolean) | null>(null);
  const { activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef } = useCmdWRefs(
    activeTab, quitConfirmOpen, unsavedQuitOpen, pickerOpen, queueOpen, taskPickerOpen, profilePickerOpen, route, current?.view,
  );

  const closeTab = useCallback((index: number) => {
    if (tabs.filter((t) => !t.dock).length === 1) { guardedOpenQuitConfirm(); return; }
    if (guardRef.current?.(index)) return; client.send({ method: 'closeTab', params: { index } });
  }, [client, tabs, guardedOpenQuitConfirm]);

  const chooseRoute = useCallback((index: number) => client.send({ method: 'chooseRoute', params: { index } }), [client]);

  useServerState(client, {
    setTabs, setActiveTab, setRoute, setHarnessLaunch, setScheduleLaunch, setTabNameMaxLength, setGlobalHistory, setSyntaxTheme, setTheme, setTasks, setJanissaryTasksDir, setProfiles, setRouteIndex,
    routeRef: routeReference,
  });

  useEffect(() => { applySyntaxTheme(syntaxTheme); }, [syntaxTheme]);

  useFocusOnTabSwitch(activeTab, currentRef, harnessHandles, shellHandles, inputReference);

  useSectionNav(tabs, () => focusCenterVisibleTab(currentRef.current, harnessHandles, shellHandles, inputReference));

  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef);

  // Live snapshot + callbacks read by the window key handler, so it never has to re-register.
  useAppWindowKeys(client, handleScrollKey, handleScrollKeyUp, {
    pickerOpen, pickerIdx: pickerIndex, recent, route, routeIdx: routeIndex, canSearch, searchOpen: search.searchOpen,
    themePickerOpen, themePickerIdx: themePickerIndex, appThemePickerOpen, appThemePickerIdx: appThemePickerIndex,
    navOpen, navQuery, navIdx: navIndex, navTabs, queueOpen, queueIdx: queueIndex, queueItems: current?.commandQueue ?? [],
    taskPickerOpen, taskPickerIdx: taskPickerIndex, visibleTasks, profilePickerOpen, profilePickerIdx: profilePickerIndex, profiles,
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
    <AppShell
      tabs={tabs} client={client} dropRef={dropReference} tabNameMaxLength={tabNameMaxLength}
      sidebarLeftWidth={sidebarLeftWidth} onSidebarLeftWidthChange={setSidebarLeftWidth}
      sidebarRightWidth={sidebarRightWidth} onSidebarRightWidthChange={setSidebarRightWidth}
    >
      <TabStrip
        tabs={actionEntries.map((e) => e.tab)}
        activeTab={actionEntries.findIndex((e) => e.index === activeTab)}
        onSelect={(index) => client.send({ method: 'setActiveTab', params: { index: actionEntries[index].index } })}
        onClose={(index) => closeTab(actionEntries[index].index)}
        onRename={(index, title) => client.renameTab(actionEntries[index].index, title)}
        tabNameMaxLength={tabNameMaxLength}
        onFocusCommandBar={() => inputReference.current?.focus()}
        windowFocused={windowFocused}
      />

      <ViewTabBody tab={current} client={client} index={currentIndex} tabs={tabs} />

      <ShellTabLayer tabs={tabs} activeLabel={current.label} client={client}
        onHandle={(id, h) => { if (h) shellHandles.current.set(id, h); else shellHandles.current.delete(id); }} />

      <MountedViewLayers tabs={tabs} current={current} client={client} closeTab={closeTab} harnessHandles={harnessHandles} editorHandles={editorHandles}
        taskPickerOpen={taskPickerOpen} taskRows={visibleTasks} taskPickerIndex={taskPickerIndex} onPickTask={pickTask} onToggleTaskDir={toggleTaskDir}
        navOpen={navOpen} navQuery={navQuery} navIndex={navIndex} onPickTab={selectNavTab} />

      {!isViewTab && !current.activePty && (
        <AgentTabBody
          current={current} client={client} lines={lines} runCommand={runCommand}
          transcriptReference={transcriptReference} highlight={highlight} inputReference={inputReference}
          route={route} routeIndex={routeIndex} chooseRoute={chooseRoute}
          syntaxTheme={syntaxTheme} themePickerOpen={themePickerOpen} themePickerIndex={themePickerIndex} pickTheme={pickTheme}
          theme={theme} appThemePickerOpen={appThemePickerOpen} appThemePickerIndex={appThemePickerIndex} pickAppTheme={pickAppTheme}
          pickerOpen={pickerOpen} recent={recent} pickerIndex={pickerIndex} pick={pick}
          navOpen={navOpen} navQuery={navQuery} navIndex={navIndex} tabs={tabs} selectNavTab={selectNavTab}
          queueOpen={queueOpen} queueIndex={queueIndex} selectQueueIndex={selectQueueIndex}
          taskPickerOpen={taskPickerOpen} visibleTasks={visibleTasks} taskPickerIndex={taskPickerIndex} pickTask={pickTask} toggleTaskDir={toggleTaskDir}
          profilePickerOpen={profilePickerOpen} profiles={profiles} profilePickerIndex={profilePickerIndex} pickProfile={pickProfile}
          quickOpenOpen={quickOpenOpen} quickOpenQuery={quickOpenQuery} setQuickOpenQuery={setQuickOpenQuery}
          quickOpenResults={quickOpenResults} quickOpenIndex={quickOpenIndex} setQuickOpenIndex={setQuickOpenIndex}
          quickOpenLoading={quickOpenLoading} pickQuickOpenFile={pickQuickOpenFile} closeQuickOpen={closeQuickOpen}
          search={search} globalHistory={globalHistory} onCommandBarSubmit={onCommandBarSubmit}
          quitConfirmOpen={quitConfirmOpen} unsavedQuitOpen={unsavedQuitOpen}
          recallReference={recallReference} onEditQueued={onEditQueued} onDeleteQueued={onDeleteQueued}
          dropRef={dropReference}
        />
      )}
      <ReportingSection
        entries={reportingEntries} onClose={closeTab}
        onRun={(id) => client.send({ method: 'runSuggestion', params: { id } })}
        onRate={(id, up) => client.send({ method: 'rateSuggestion', params: { id, up } })}
        onReset={(name) => client.send({ method: 'resetMonitorContext', params: { name } })}
        onSnapshot={(name) => client.send({ method: 'monitorContextSnapshot', params: { name } })}
        heightPct={reportingHeightPct} onHeightPctChange={setReportingHeightPct}
      />
      {harnessLaunch && <HarnessLaunchDialog view={harnessLaunch} client={client} />}
      {scheduleLaunch && <ScheduleDialog view={scheduleLaunch} client={client} />}
      {quitConfirmOpen && <QuitDialog onConfirm={confirmQuit} onCancel={cancelQuit} />}
      {unsavedQuitOpen && <UnsavedQuitDialog onConfirm={confirmUnsavedQuit} onCancel={cancelUnsavedQuit} />}
      <CloseSaveGuard tabs={tabs} editorHandles={editorHandles} client={client} guardRef={guardRef} />
    </AppShell>
  );
}
