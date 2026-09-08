import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JanusClient } from './ws';
import type { TabView, HarnessLaunchView, ScheduleLaunchView, TaskRow, ProfileRow } from '@shared/protocol';
import { AppMain } from './AppMain';
import type { CommandInputDropHandle, EditorDropHandle } from './drop-handles';
import type { DirtyTabHandle } from './tab-handles';
import { useTabHandles } from './useTabHandles';
import { useCommandBarSubmit } from './agent-tabs/command-input/useCommandBarSubmit';
import { useCommandDrafts } from './agent-tabs/command-input/useCommandDrafts';
import { useUnsavedQuitGuard } from './useUnsavedQuitGuard';
import { useFocusOnTabSwitch, focusCenterVisibleTab } from './useFocusOnTabSwitch';
import { useSectionNav } from './useSectionNav';
import { useTabEntries } from './useTabEntries';
import { useViewSearchState } from './useViewSearchState';
import { useCmdW } from './useCmdW';
import { useTranscriptScroll } from './shared/transcript/useTranscriptScroll';
import { useQuitConfirm } from './QuitDialog/useQuitConfirm';
import { useAppWindowKeys } from './useAppWindowKeys';
import { usePickerOverlays } from './pickers/usePickerOverlays';
import { useServerState, useTabNameLimits } from './useServerState';
import { useLayoutState } from './useLayoutState';
import { applySyntaxTheme } from './editor/highlight/themes';
import { useWindowFocus } from './useWindowFocus';
import { useCmdWRefs } from './useCmdWRefs';
import { collectNavigatorSelections } from './file-navigator/file-navigator-selection-registry';

export function App({ client }: { client: JanusClient }) {
  const [tabs, setTabs] = useState<TabView[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [secondaryTab, setSecondaryTab] = useState<number>();
  const { tabNameMaxLength, setTabNameMaxLength, activeTabNameMaxLength, setActiveTabNameMaxLength } = useTabNameLimits();
  const [globalHistory, setGlobalHistory] = useState<string[]>([]);
  const [syntaxTheme, setSyntaxTheme] = useState('github-dark');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  // Server-driven "New harness" launch dialog (null when closed).
  const [harnessLaunch, setHarnessLaunch] = useState<HarnessLaunchView | null>(null);
  // Server-driven "New schedule" dialog (null when closed).
  const [scheduleLaunch, setScheduleLaunch] = useState<ScheduleLaunchView | null>(null);
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
  // The command bar a tab switch tears down or hands to another tab; its unexecuted text is kept
  // here, per tab, so returning to a tab shows what was left in its bar.
  const commandDrafts = useCommandDrafts(tabs);
  const {
    sidebarLeftWidth, setSidebarLeftWidth, sidebarRightWidth, setSidebarRightWidth, reportingHeightPct, setReportingHeightPct,
    focusLeft, focusRight,
  } = useLayoutState(client);

  const current = tabs[activeTab] ?? actionEntries[0]?.tab;
  currentRef.current = current;
  const lines = useMemo(() => current?.bufferLines ?? [], [current]);

  const { canSearch, search, highlight } = useViewSearchState(current, lines);

  const runCommand = useCallback((text: string) => client.send({ method: 'command', params: { text } }), [client]);
  // Every modal overlay's state, under one owner. It hands out a bag per consumer — the render tree,
  // the window key handler, the command bar's interception chain, the server state stream — so none
  // of them restates the others' fields (see `pickers/usePickerOverlays`).
  const pickers = usePickerOverlays({
    client, current, tabs, syntaxTheme, tasks, profiles, runCommand,
    inputRef: inputReference, recallRef: recallReference, dropRef: dropReference,
  });

  const { quitConfirmOpen, openQuitConfirm, confirmQuit, cancelQuit } = useQuitConfirm(runCommand, inputReference);
  // Every dirty-capable tab handle, editor and plugin alike, keyed by tab label. The close guard,
  // the quit guard, and the editor focus path all reach a tab through this one map.
  const tabHandles = useRef<Map<string, DirtyTabHandle>>(new Map());
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
    activeTab, quitConfirmOpen, unsavedQuitOpen, pickers.overlays, pickers.route,
  );

  const closeTab = useCallback((index: number) => {
    if (tabs.filter((t) => !t.dock).length === 1) { guardedOpenQuitConfirm(); return; }
    if (guardRef.current?.(index)) return; client.send({ method: 'closeTab', params: { index } });
  }, [client, tabs, guardedOpenQuitConfirm]);

  useServerState(client, {
    setTabs, setActiveTab, setSecondaryTab, setHarnessLaunch, setScheduleLaunch,
    setTabNameMaxLength, setActiveTabNameMaxLength, setGlobalHistory, setSyntaxTheme,
    setTasks, setProfiles,
    ...pickers.serverState,
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

  // Live snapshot + callbacks read by the window key handler, so it never has to re-register. Every
  // overlay-owned field arrives in one bag; only search's two are the app shell's to add.
  useAppWindowKeys(client, handleScrollKey, handleScrollKeyUp, {
    ...pickers.keys, canSearch, searchOpen: search.searchOpen, openSearch: () => search.open(''),
  });

  const onCommandBarSubmit = useCommandBarSubmit({
    ...pickers.commands,
    canSearch, lines, search, tabs, openQuitConfirm: guardedOpenQuitConfirm, guardRef, activeTab, runCommand,
  });

  if (!current) return <div className="app" style={{ padding: 16, color: 'var(--muted)' }}>Connecting…</div>;

  return (
    <AppMain
      current={current} client={client} lines={lines} runCommand={runCommand}
      transcriptReference={transcriptReference} highlight={highlight} inputReference={inputReference}
      pickers={pickers.view} tabs={tabs}
      search={search} globalHistory={globalHistory} commandDrafts={commandDrafts}
      onCommandBarSubmit={onCommandBarSubmit}
      quitConfirmOpen={quitConfirmOpen} unsavedQuitOpen={unsavedQuitOpen}
      recallReference={recallReference}
      onEditQueued={pickers.onEditQueued} onDeleteQueued={pickers.onDeleteQueued}
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
