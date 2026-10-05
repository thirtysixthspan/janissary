import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JanusClient } from './ws';
import type { TabView, HarnessLaunchView, ScheduleLaunchView, TaskRow, ProfileRow } from '@shared/protocol';
import { closeQuitsApp } from '@shared/tab/placement';
import { AppMain } from './AppMain';
import type { CommandInputDropHandle } from './shared/drop-handles';
import type { DirtyTabHandle } from './shared/tab/handles';
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
import { createPluginChordRegistry, PluginChordProvider } from './plugins/PluginChords';
import { AppCommandBarProvider, useAppCommandLine } from './shared/command-bar/AppCommandBar';
import { usePickerOverlays } from './pickers/usePickerOverlays';
import { commandBarSuppressed, firstOpenOverlay } from './pickers/overlay-registry';
import { useServerState, useTabNameLimits, useClipboardHistoryCap } from './useServerState';
import { useLayoutState } from './useLayoutState';
import { applySyntaxTheme } from './editor/highlight/themes';
import { useWindowFocus } from './useWindowFocus';
import { useCmdWRefs } from './useCmdWRefs';
import { collectNavigatorSelections } from './file-navigator/file/navigator-selection-registry';
import { useOverlayPlugins } from './useOverlayPlugins';

export function App({ client }: { client: JanusClient }) {
  // One registry for the chords plugin tabs claim while visible, owned here because both the window
  // key handler and every mounted plugin body live in this tree and have to be looking at the same
  // one. Built once per mount; claims are re-established by each body's effect.
  const [pluginChords] = useState(createPluginChordRegistry);
  const [tabs, setTabs] = useState<TabView[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [secondaryTab, setSecondaryTab] = useState<number>();
  const { tabNameMaxLength, setTabNameMaxLength, activeTabNameMaxLength, setActiveTabNameMaxLength } = useTabNameLimits();
  const { clipboardHistoryMaxEntries, setClipboardHistoryMaxEntries } = useClipboardHistoryCap();
  const [globalHistory, setGlobalHistory] = useState<string[]>([]);
  const [syntaxTheme, setSyntaxTheme] = useState('github-dark');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [pickerSourceTab, setPickerSourceTab] = useState<string>();
  const [focusedPluginTab, setFocusedPluginTab] = useState<string>();
  // Server-driven "New harness" launch dialog (null when closed).
  const [harnessLaunch, setHarnessLaunch] = useState<HarnessLaunchView | null>(null);
  // Server-driven "New schedule" dialog (null when closed).
  const [scheduleLaunch, setScheduleLaunch] = useState<ScheduleLaunchView | null>(null);
  const inputReference = useRef<HTMLTextAreaElement>(null);
  const pluginCommandLineInsertions = useRef(new Map<string, (text: string) => void>());
  // Assigned `CommandInput`'s `recall` (the `guardRef` pattern); shared by the queue and task
  // pickers so a selected row's text lands in the command line without submitting.
  const recallReference = useRef<((text: string) => void) | null>(null);
  // Assigned `CommandInput`'s insert-at-caret/highlight pair (the `guardRef` pattern) so a
  // file-navigator drag, threaded down the sidebar's own branch of the tree, can insert a dropped path
  // into whichever tab's command bar is currently rendered here.
  const dropReference = useRef<CommandInputDropHandle | null>(null);
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

  // The overlay-plugin host. Nothing holds it: the seam resolves a chord or a command word to a plugin
  // and the host loads its chunk, so every route into an overlay — the chord, the `clip` command, and
  // the context menu — goes through one place. It is built here because the app shell is the only
  // place free to import the command bar, the editor's drop registry, and the tab view at once, and
  // those are what the one capability a plugin gets is assembled from.
  // `currentTab` is a callback because the host is built once and needs the tab at the moment a paste
  // happens; it is wrapped so the hook's memo does not see a new function on every render.
  const currentTabForOverlay = useCallback(() => currentRef.current, []);
  const focusHarness = useCallback((ptyId: string) => { harnessHandles.current.get(ptyId)?.focus(); }, [harnessHandles]);
  useOverlayPlugins({
    client, dropRef: dropReference, maxEntries: clipboardHistoryMaxEntries,
    currentTab: currentTabForOverlay, focusHarness, tabLabel: current?.label,
  });

  const { canSearch, search, highlight } = useViewSearchState(current, lines);

  const runCommand = useCallback((text: string) => client.send({ method: 'command', params: { text } }), [client]);
  // Every modal overlay's state, under one owner. It hands out a bag per consumer — the render tree,
  // the window key handler, the command bar's interception chain, the server state stream — so none
  // of them restates the others' fields (see `pickers/usePickerOverlays`).
  const pickers = usePickerOverlays({
    client, current, tabs, syntaxTheme, tasks, profiles, runCommand,
    inputRef: inputReference, recallRef: recallReference, dropRef: dropReference, focusHarness,
    pluginCommandLineInsertions,
  });

  useEffect(() => {
    if (!firstOpenOverlay(pickers.view.overlays)) setPickerSourceTab(undefined);
  }, [pickers.view.overlays]);

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
  const focusedPluginTabIndexRef = useRef<number | undefined>(undefined);
  const focusedPluginTabIndex = focusedPluginTab === undefined
    ? -1 : tabs.findIndex((tab) => tab.label === focusedPluginTab);
  focusedPluginTabIndexRef.current = focusedPluginTabIndex < 0 ? undefined : focusedPluginTabIndex;

  const closeTab = useCallback((index: number) => {
    if (closeQuitsApp(tabs, index)) { guardedOpenQuitConfirm(); return; }
    if (guardRef.current?.(index)) return;
    const tab = tabs.at(index);
    if (tab) client.send({ method: 'closeTab', params: { label: tab.label } });
  }, [client, tabs, guardedOpenQuitConfirm]);

  useServerState(client, {
    setTabs, setActiveTab, setSecondaryTab, setHarnessLaunch, setScheduleLaunch,
    setTabNameMaxLength, setActiveTabNameMaxLength, setClipboardHistoryMaxEntries, setGlobalHistory,
    setSyntaxTheme,
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

  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, focusedPluginTabIndexRef);

  // Live snapshot + callbacks read by the window key handler, so it never has to re-register. Every
  // overlay-owned field arrives in one bag; only search's two are the app shell's to add.
  useAppWindowKeys(client, handleScrollKey, handleScrollKeyUp, {
    ...pickers.keys, canSearch, searchOpen: search.searchOpen, openSearch: () => search.open(''),
    currentPluginTab: current?.plugin ? current.label : undefined,
  }, pluginChords);

  const onCommandBarSubmit = useCommandBarSubmit({
    ...pickers.commands,
    canSearch, lines, search, tabs, openQuitConfirm: guardedOpenQuitConfirm, guardRef, activeTab, runCommand,
  });

  // The same interception, published to every plugin tab below so a line typed into one of their bars
  // is answered here rather than sent to the server unchecked. The provider is the sibling of
  // `PluginChordProvider` for the same reason: both are app-level state a mounted plugin body has to
  // reach, and neither can be threaded down through the tab tree without changing a dozen signatures.
  const interceptCommandLine = useAppCommandLine({
    ...pickers.commands, tabs, activeTab, openQuitConfirm: guardedOpenQuitConfirm, guardRef,
    onPickerOpen: setPickerSourceTab,
  });

  if (!current) return <div className="app" style={{ padding: 16, color: 'var(--muted)' }}>Connecting…</div>;

  return (
    <PluginChordProvider registry={pluginChords}>
      <AppCommandBarProvider bar={{
        intercept: interceptCommandLine,
        ghostHistory: globalHistory,
        blockingOverlayOpen: pickers.view.overlays.quickOpen,
        overlayOwnsCommandBar: commandBarSuppressed(pickers.view.overlays),
        onFocusTab: setFocusedPluginTab,
        queueOpen: pickers.view.overlays.queue,
        queueIndex: pickers.view.queueIndex,
        queueItems: pickers.view.queueItems,
        onEditQueued: pickers.onEditQueued,
        onDeleteQueued: pickers.onDeleteQueued,
        pluginCommandLineInsertions,
      }}>
      <AppMain
      current={current} client={client} lines={lines} runCommand={runCommand}
      transcriptReference={transcriptReference} highlight={highlight} inputReference={inputReference}
      pickers={pickers.view} pickerSourceTab={pickerSourceTab} tabs={tabs}
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
      tabHandles={tabHandles}
      dirtyPluginTabs={dirtyPluginTabs} onPluginDirty={onPluginDirty}
      harnessLaunch={harnessLaunch} scheduleLaunch={scheduleLaunch}
      confirmQuit={confirmQuit} cancelQuit={cancelQuit}
      confirmUnsavedQuit={confirmUnsavedQuit} cancelUnsavedQuit={cancelUnsavedQuit}
      guardRef={guardRef}
      />
      </AppCommandBarProvider>
    </PluginChordProvider>
  );
}
