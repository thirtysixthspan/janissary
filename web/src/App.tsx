import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JanusClient } from './ws';
import type { TabView, RouteChooserView } from '@shared/protocol';
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
import { resolveSearchInterception } from './command-interceptions';
import { StatusPanels } from './StatusPanels';
import { HistoryPicker } from './HistoryPicker';
import { ThemePicker } from './ThemePicker';
import { RouteChooser } from './RouteChooser';
import { SYNTAX_THEMES } from '@shared/syntax-themes';
import { QuitDialog } from './QuitDialog/QuitDialog';
import { CloseSaveGuard } from './CloseSaveGuard';
import { getRecentHistory } from './history';
import { useCmdW } from './useCmdW';
import { useTranscriptScroll } from './useTranscriptScroll';
import { useQuitConfirm } from './QuitDialog/useQuitConfirm';
import { useWindowKeys } from './useWindowKeys';
import { useThemePicker } from './useThemePicker';
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);
  // Server-driven route chooser (null when closed); `routeIdx` is the highlighted option.
  const [route, setRoute] = useState<RouteChooserView | null>(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const routeReference = useRef<RouteChooserView | null>(null);
  const inputReference = useRef<HTMLTextAreaElement>(null);
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

  const isViewTab = (['image', 'page', 'harness', 'markdown', 'editor', 'files'] as const).includes(current?.view as 'image' | 'page' | 'harness' | 'markdown' | 'editor' | 'files');
  const canSearch = !isViewTab && !current?.activePty;
  const search = useTranscriptSearch(lines, current?.label ?? '');
  const highlight = search.searchOpen && search.currentLineIndex !== null
    ? { lineIndex: search.currentLineIndex, pattern: search.pattern }
    : null;

  const runCommand = useCallback((text: string) => client.send({ method: 'command', params: { text } }), [client]);
  const { themePickerOpen, themePickerIndex, setThemePickerIndex, setThemePickerOpen, openThemePicker, pickTheme } =
    useThemePicker(syntaxTheme, runCommand);

  // Live snapshot read by the window key handler, so it never has to re-register.
  const stateReference = useRef({
    pickerOpen, pickerIdx: pickerIndex, recent, route, routeIdx: routeIndex, canSearch, searchOpen: search.searchOpen,
    themePickerOpen, themePickerIdx: themePickerIndex,
  });
  stateReference.current = {
    pickerOpen, pickerIdx: pickerIndex, recent, route, routeIdx: routeIndex, canSearch, searchOpen: search.searchOpen,
    themePickerOpen, themePickerIdx: themePickerIndex,
  };

  const openPicker = () => {
    // Always open on hist / Ctrl+R; highlight the most recent (bottom) entry.
    setPickerIndex(Math.max(0, stateReference.current.recent.length - 1));
    setPickerOpen(true);
  };
  const pick = (command: string) => { runCommand(command); setPickerOpen(false); };
  const { quitConfirmOpen, openQuitConfirm, confirmQuit, cancelQuit } = useQuitConfirm(runCommand, inputReference);
  const editorHandles = useRef<Map<string, EditorTabHandle>>(new Map());
  const guardRef = useRef<((index: number) => boolean) | null>(null);
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const quitConfirmOpenRef = useRef(quitConfirmOpen); quitConfirmOpenRef.current = quitConfirmOpen;
  const pickerOpenRef = useRef(pickerOpen); pickerOpenRef.current = pickerOpen;
  const routeRef = useRef(route); routeRef.current = route;
  const activeViewRef = useRef(current?.view); activeViewRef.current = current?.view;

  const closeTab = useCallback((index: number) => {
    if (guardRef.current?.(index)) return;
    client.send({ method: 'closeTab', params: { index } });
  }, [client]);

  const chooseRoute = useCallback((index: number) => client.send({ method: 'chooseRoute', params: { index } }), [client]);

  useEffect(() => client.onState((nextTabs, active, nextRoute, nextTabNameMaxLength, nextGlobalHistory, nextSyntaxTheme) => {
    setTabs(nextTabs);
    setActiveTab(active);
    setRoute(nextRoute);
    setTabNameMaxLength(nextTabNameMaxLength);
    setGlobalHistory(nextGlobalHistory);
    setSyntaxTheme(nextSyntaxTheme);
    // Highlight the first option when a chooser newly opens (or its command changes).
    const previous = routeReference.current;
    routeReference.current = nextRoute;
    if (nextRoute && (!previous || previous.cmd !== nextRoute.cmd)) setRouteIndex(0);
  }), [client]);

  useEffect(() => { applySyntaxTheme(syntaxTheme); }, [syntaxTheme]);

  // Switching tabs: harness/shell PTY tabs focus the terminal; all others focus the command line.
  useEffect(() => {
    const cur = currentRef.current;
    const harnessPtyId = cur?.view === 'harness' ? cur.harness?.ptyId : undefined;
    if (harnessPtyId) harnessHandles.current.get(harnessPtyId)?.focus();
    else if (cur?.activePty) shellHandles.current.get(cur.activePty)?.focus();
    else inputReference.current?.focus();
  }, [activeTab]);

  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef);

  const openSearch = () => search.open('');
  const keyCallbacksRef = useRef({
    setRouteIndex, chooseRoute, runCommand, setPickerIndex, setPickerOpen, openPicker, openSearch,
    setThemePickerIndex, setThemePickerOpen, pickTheme,
  });
  keyCallbacksRef.current = {
    setRouteIndex, chooseRoute, runCommand, setPickerIndex, setPickerOpen, openPicker, openSearch,
    setThemePickerIndex, setThemePickerOpen, pickTheme,
  };

  useWindowKeys(client, stateReference, keyCallbacksRef, handleScrollKey, handleScrollKeyUp);

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

      <ViewTabBody tab={current} client={client} index={currentIndex} />

      <ShellTabLayer tabs={tabs} activeLabel={current.label} client={client}
        onHandle={(id, h) => { if (h) shellHandles.current.set(id, h); else shellHandles.current.delete(id); }} />

      <MountedViewLayers tabs={tabs} current={current} client={client} harnessHandles={harnessHandles} editorHandles={editorHandles} />

      {!isViewTab && !current.activePty && (
        <div
          className="tab-body"
          style={{ borderLeft: `4px solid ${current.dotColor}` }}
          onMouseDown={() => setTimeout(() => inputReference.current?.focus(), 0)}
          onMouseUp={() => {
            const selection = globalThis.getSelection()?.toString();
            if (selection) {
              navigator.clipboard.writeText(selection);
            }
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
            {route && <RouteChooser cmd={route.cmd} choices={route.choices} selected={routeIndex} onPick={chooseRoute} />}
            {!route && themePickerOpen && (
              <ThemePicker themes={SYNTAX_THEMES} active={syntaxTheme} selected={themePickerIndex} onPick={pickTheme} />
            )}
            {!route && !themePickerOpen && pickerOpen && <HistoryPicker items={recent} selected={pickerIndex} onPick={pick} />}
          </div>
          <CommandArea
            search={search}
            lines={lines}
            dotColor={current.dotColor}
            history={current.cmdHistory}
            ghostHistory={globalHistory}
            onSubmit={(text) => {
              const searchPattern = resolveSearchInterception(text, canSearch, lines);
              if (searchPattern !== null) { search.open(searchPattern); return; }
              const trimmed = text.trim().toLowerCase();
              if (trimmed === 'hist') openPicker();
              else if (trimmed === 'syntax theme') openThemePicker();
              else if (trimmed === 'quit' || ((trimmed === 'close' || trimmed === 'exit') && tabs.length === 1)) openQuitConfirm();
              else if ((trimmed === 'close' || trimmed === 'exit') && guardRef.current?.(activeTab)) return;
              else runCommand(text);
            }}
            inputRef={inputReference}
            complete={(text, cursor) => client.request({ method: 'complete', params: { text, cursor } })}
            pickerOpen={pickerOpen || route !== null || quitConfirmOpen || themePickerOpen}
          />
        </div>
      )}
      <ReportingSection
        entries={reportingEntries}
        onClose={closeTab}
        onRun={(id) => client.send({ method: 'runSuggestion', params: { id } })}
        onRate={(id, up) => client.send({ method: 'rateSuggestion', params: { id, up } })}
      />
      {quitConfirmOpen && <QuitDialog onConfirm={confirmQuit} onCancel={cancelQuit} />}
      <CloseSaveGuard tabs={tabs} editorHandles={editorHandles} client={client} guardRef={guardRef} />
    </AppShell>
  );
}
