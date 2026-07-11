import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JanusClient } from './ws';
import type { TabView, RouteChooserView, TaskRow } from '@shared/protocol';
import { TabStrip } from './TabStrip';
import { Transcript } from './Transcript';
import { ViewTabBody } from './ViewTabBody';
import { ReportingSection, isReportingTab } from './ReportingSection';
import { AppShell } from './AppShell';
import type { HarnessTabHandle } from './HarnessTab';
import type { EditorTabHandle } from './EditorTab';
import type { ShellTabHandle } from './ShellTab';
import { ShellTabLayer } from './ShellTabLayer';
import { MountedViewLayers } from './MountedViewLayers';
import { CommandArea } from './CommandArea';
import { useTranscriptSearch } from './useTranscriptSearch';
import { StatusPanels } from './StatusPanels';
import { PickerOverlays } from './PickerOverlays';
import { useTabNav } from './useTabNav';
import { useQueuePicker } from './useQueuePicker';
import { usePopulatePickers } from './usePopulatePickers';
import { useCommandBarSubmit } from './useCommandBarSubmit';
import { QuitDialog } from './QuitDialog/QuitDialog';
import { UnsavedQuitDialog } from './UnsavedQuitDialog';
import { CloseSaveGuard } from './CloseSaveGuard';
import { useUnsavedQuitGuard } from './useUnsavedQuitGuard';
import { useFocusOnTabSwitch } from './useFocusOnTabSwitch';
import { getRecentHistory } from './history';
import { useCmdW } from './useCmdW';
import { useTranscriptScroll } from './useTranscriptScroll';
import { useQuitConfirm } from './QuitDialog/useQuitConfirm';
import { useAppWindowKeys } from './useAppWindowKeys';
import { useThemePicker } from './useThemePicker';
import { useAppThemePicker } from './useAppThemePicker';
import { useHistPicker } from './useHistPicker';
import { useServerState } from './useServerState';
import { applySyntaxTheme } from './editor/highlight/themes';

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
  const [profiles, setProfiles] = useState<string[]>([]);
  // Server-driven route chooser (null when closed); `routeIdx` is the highlighted option.
  const [route, setRoute] = useState<RouteChooserView | null>(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const routeReference = useRef<RouteChooserView | null>(null);
  const inputReference = useRef<HTMLTextAreaElement>(null);
  // Assigned `CommandInput`'s `recall` (the `guardRef` pattern); shared by the queue and task
  // pickers so a selected row's text lands in the command line without submitting.
  const recallReference = useRef<((text: string) => void) | null>(null);
  const transcriptReference = useRef<HTMLDivElement>(null);
  const harnessHandles = useRef<Map<string, HarnessTabHandle>>(new Map());
  const shellHandles = useRef<Map<string, ShellTabHandle>>(new Map());
  const currentRef = useRef<TabView | undefined>(undefined);
  const { handleScrollKey, handleScrollKeyUp } = useTranscriptScroll(transcriptReference);

  // Action tabs (above the command bar, take commands) vs. reporting tabs (below it,
  // report-only). Each entry keeps its index in the server's full tab list for RPCs. A tab
  // docked into a sidebar leaves the strip entirely (rendered by Sidebar instead) while staying
  // in the server's tab array, so RPCs still address it by index.
  const actionEntries = useMemo(() => tabs.map((tab, index) => ({ tab, index })).filter((e) => !isReportingTab(e.tab) && !e.tab.dock), [tabs]);
  const reportingEntries = useMemo(() => tabs.map((tab, index) => ({ tab, index })).filter((e) => isReportingTab(e.tab)), [tabs]);

  const current = tabs[activeTab] ?? actionEntries[0]?.tab;
  // `current`'s real index in the server's tab list — usually `activeTab`, but that can point
  // past the end transiently (e.g. right after closing the last tab, before new state arrives),
  // in which case `current` falls back to the first action tab and this must follow it.
  const currentIndex = activeTab < tabs.length ? activeTab : (actionEntries[0]?.index ?? 0);
  currentRef.current = current;
  const lines = useMemo(() => current?.bufferLines ?? [], [current]);
  // The picker lists the tab's recent history, most recent at the bottom (suppressed when empty).
  const recent = useMemo(() => getRecentHistory(current?.cmdHistory ?? [], 10), [current]);

  const isViewTab = (['image', 'page', 'harness', 'markdown', 'editor', 'files', 'notifications'] as const).includes(current?.view as 'image' | 'page' | 'harness' | 'markdown' | 'editor' | 'files' | 'notifications');
  const canSearch = !isViewTab && !current?.activePty;
  const search = useTranscriptSearch(lines, current?.label ?? '');
  const highlight = search.searchOpen && search.currentLineIndex !== null
    ? { lineIndex: search.currentLineIndex, pattern: search.pattern }
    : null;

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
    queueOpen, queueIndex, setQueueIndex, setQueueOpen, openQueue, selectQueueIndex, onEditQueued, onDeleteQueued,
  } = useQueuePicker(client, current, inputReference, recallReference);
  const {
    taskPickerOpen, taskPickerIndex, setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask, visibleTasks, toggleTaskDir, profilePickerOpen, profilePickerIndex, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile,
  } = usePopulatePickers(tasks, recallReference, inputReference, client, current?.view === 'harness' ? current.harness?.ptyId : undefined);

  const { quitConfirmOpen, openQuitConfirm, confirmQuit, cancelQuit } = useQuitConfirm(runCommand, inputReference);
  const editorHandles = useRef<Map<string, EditorTabHandle>>(new Map());
  const { unsavedQuitOpen, guardedOpenQuitConfirm, confirmUnsavedQuit, cancelUnsavedQuit } =
    useUnsavedQuitGuard(tabs, editorHandles, openQuitConfirm, runCommand);
  const guardRef = useRef<((index: number) => boolean) | null>(null);
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const quitConfirmOpenRef = useRef(quitConfirmOpen); quitConfirmOpenRef.current = quitConfirmOpen || unsavedQuitOpen;
  const pickerOpenRef = useRef(pickerOpen); pickerOpenRef.current = pickerOpen || queueOpen || taskPickerOpen || profilePickerOpen;
  const routeRef = useRef(route); routeRef.current = route;
  const activeViewRef = useRef(current?.view); activeViewRef.current = current?.view;

  const closeTab = useCallback((index: number) => {
    if (tabs.filter((t) => !t.dock).length === 1) { guardedOpenQuitConfirm(); return; }
    if (guardRef.current?.(index)) return; client.send({ method: 'closeTab', params: { index } });
  }, [client, tabs, guardedOpenQuitConfirm]);

  const chooseRoute = useCallback((index: number) => client.send({ method: 'chooseRoute', params: { index } }), [client]);

  useServerState(client, {
    setTabs, setActiveTab, setRoute, setTabNameMaxLength, setGlobalHistory, setSyntaxTheme, setTheme, setTasks, setProfiles, setRouteIndex,
    routeRef: routeReference,
  });

  useEffect(() => { applySyntaxTheme(syntaxTheme); }, [syntaxTheme]);

  useFocusOnTabSwitch(activeTab, currentRef, harnessHandles, shellHandles, inputReference);

  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef);

  // Live snapshot + callbacks read by the window key handler, so it never has to re-register.
  useAppWindowKeys(client, handleScrollKey, handleScrollKeyUp, {
    pickerOpen, pickerIdx: pickerIndex, recent, route, routeIdx: routeIndex, canSearch, searchOpen: search.searchOpen,
    themePickerOpen, themePickerIdx: themePickerIndex, appThemePickerOpen, appThemePickerIdx: appThemePickerIndex,
    navOpen, navQuery, navIdx: navIndex, navTabs, queueOpen, queueIdx: queueIndex, queueItems: current?.commandQueue ?? [],
    taskPickerOpen, taskPickerIdx: taskPickerIndex, visibleTasks, profilePickerOpen, profilePickerIdx: profilePickerIndex, profiles,
    setRouteIndex, chooseRoute, runCommand, setPickerIndex, setPickerOpen, openPicker, openSearch: () => search.open(''),
    setThemePickerIndex, setThemePickerOpen, pickTheme, setAppThemePickerIndex, setAppThemePickerOpen, pickAppTheme,
    setNavIndex, setNavQuery, selectNavTab, setNavOpen, openTabNav,
    setQueueIndex, setQueueOpen, openQueue,
    setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask, toggleTaskDir, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile,
  });

  const onCommandBarSubmit = useCommandBarSubmit({
    canSearch, lines, search, openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker, navOpen, setNavOpen,
    openTabNavWithQuery, tabs, openQuitConfirm: guardedOpenQuitConfirm, guardRef, activeTab, runCommand,
  });

  if (!current) return <div className="app" style={{ padding: 16, color: 'var(--muted)' }}>Connecting…</div>;

  return (
    <AppShell tabs={tabs} client={client}>
      <TabStrip
        tabs={actionEntries.map((e) => e.tab)}
        activeTab={actionEntries.findIndex((e) => e.index === activeTab)}
        onSelect={(index) => client.send({ method: 'setActiveTab', params: { index: actionEntries[index].index } })}
        onClose={(index) => closeTab(actionEntries[index].index)}
        onRename={(index, title) => client.renameTab(actionEntries[index].index, title)}
        tabNameMaxLength={tabNameMaxLength}
        onFocusCommandBar={() => inputReference.current?.focus()}
      />

      <ViewTabBody tab={current} client={client} index={currentIndex} closeTab={closeTab} />

      <ShellTabLayer tabs={tabs} activeLabel={current.label} client={client}
        onHandle={(id, h) => { if (h) shellHandles.current.set(id, h); else shellHandles.current.delete(id); }} />

      <MountedViewLayers tabs={tabs} current={current} client={client} harnessHandles={harnessHandles} editorHandles={editorHandles}
        taskPickerOpen={taskPickerOpen} taskRows={visibleTasks} taskPickerIndex={taskPickerIndex} onPickTask={pickTask} onToggleTaskDir={toggleTaskDir} />

      {!isViewTab && !current.activePty && (
        <div
          className="tab-body"
          style={{ borderLeft: `4px solid ${current.dotColor}` }}
          onMouseUp={() => {
            const selection = globalThis.getSelection()?.toString();
            if (selection) { navigator.clipboard.writeText(selection); return; }
            inputReference.current?.focus();
          }}
        >
          <div className="main">
            <Transcript
              lines={lines}
              client={client}
              onToggleCollapse={() => client.send({ method: 'toggleCollapse', params: {} })}
              onPromptClick={(text) => runCommand(text)}
              scrollRef={transcriptReference}
              highlight={highlight}
            />
            <StatusPanels tab={current} />
            <PickerOverlays
              route={route} routeIndex={routeIndex} onPickRoute={chooseRoute}
              syntaxTheme={syntaxTheme} themePickerOpen={themePickerOpen} themePickerIndex={themePickerIndex} onPickTheme={pickTheme}
              theme={theme} appThemePickerOpen={appThemePickerOpen} appThemePickerIndex={appThemePickerIndex} onPickAppTheme={pickAppTheme}
              pickerOpen={pickerOpen} recent={recent} pickerIndex={pickerIndex} onPickHistory={pick}
              navOpen={navOpen} navQuery={navQuery} navIndex={navIndex} tabs={tabs} onPickTab={selectNavTab}
              queueOpen={queueOpen} queueItems={current.commandQueue} queueIndex={queueIndex} onSelectQueue={selectQueueIndex}
              taskPickerOpen={taskPickerOpen} taskRows={visibleTasks} taskPickerIndex={taskPickerIndex} onPickTask={pickTask} onToggleTaskDir={toggleTaskDir}
              profilePickerOpen={profilePickerOpen} profiles={profiles} profilePickerIndex={profilePickerIndex} onPickProfile={pickProfile} />
          </div>
          <CommandArea
            search={search}
            lines={lines}
            dotColor={current.dotColor}
            history={current.cmdHistory}
            ghostHistory={globalHistory}
            onSubmit={onCommandBarSubmit}
            inputRef={inputReference}
            complete={(text, cursor) => client.request({ method: 'complete', params: { text, cursor } })}
            pickerOpen={pickerOpen || route !== null || quitConfirmOpen || unsavedQuitOpen || themePickerOpen || appThemePickerOpen || navOpen || taskPickerOpen || profilePickerOpen}
            busy={current.busy}
            queueOpen={queueOpen}
            recallRef={recallReference}
            onEditQueued={onEditQueued}
            onDeleteQueued={onDeleteQueued}
          />
        </div>
      )}
      <ReportingSection
        entries={reportingEntries} onClose={closeTab}
        onRun={(id) => client.send({ method: 'runSuggestion', params: { id } })}
        onRate={(id, up) => client.send({ method: 'rateSuggestion', params: { id, up } })}
        onReset={(name) => client.send({ method: 'resetMonitorContext', params: { name } })}
      />
      {quitConfirmOpen && <QuitDialog onConfirm={confirmQuit} onCancel={cancelQuit} />}
      {unsavedQuitOpen && <UnsavedQuitDialog onConfirm={confirmUnsavedQuit} onCancel={cancelUnsavedQuit} />}
      <CloseSaveGuard tabs={tabs} editorHandles={editorHandles} client={client} guardRef={guardRef} />
    </AppShell>
  );
}
