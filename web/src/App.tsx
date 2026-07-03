import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JanusClient } from './ws';
import type { TabView, RouteChooserView } from '@shared/protocol';
import { TabStrip } from './TabStrip';
import { Transcript } from './Transcript';
import { ViewTabBody } from './ViewTabBody';
import { ReportingSection, isReportingTab } from './ReportingSection';
import { HarnessTab, type HarnessTabHandle } from './HarnessTab';
import type { ShellTabHandle } from './ShellTab';
import { ShellTabLayer } from './ShellTabLayer';
import { CommandInput } from './CommandInput';
import { StatusPanels } from './StatusPanels';
import { HistoryPicker } from './HistoryPicker';
import { RouteChooser } from './RouteChooser';
import { QuitDialog } from './QuitDialog/QuitDialog';
import { getRecentHistory } from './history';
import { useTranscriptScroll } from './useTranscriptScroll';
import { useQuitConfirm } from './QuitDialog/useQuitConfirm';
import { handleRouteChooserKey, handlePickerKey } from './keyboard-handlers';

export function App() {
  const clientReference = useRef<JanusClient | null>(null);
  clientReference.current ??= new JanusClient();
  const client = clientReference.current;

  const [tabs, setTabs] = useState<TabView[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  // Default until the first state event arrives; the server value (from application config) wins.
  const [tabNameMaxLength, setTabNameMaxLength] = useState(16);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);
  // Server-driven route chooser (null when closed); `routeIdx` is the highlighted option.
  const [route, setRoute] = useState<RouteChooserView | null>(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const routeReference = useRef<RouteChooserView | null>(null);
  const inputReference = useRef<HTMLInputElement>(null);
  const transcriptReference = useRef<HTMLDivElement>(null);
  const harnessHandles = useRef<Map<string, HarnessTabHandle>>(new Map());
  const shellHandles = useRef<Map<string, ShellTabHandle>>(new Map());
  const currentRef = useRef<TabView | undefined>(undefined);
  const { handleScrollKey, handleScrollKeyUp } = useTranscriptScroll(transcriptReference);

  // Action tabs (above the command bar, take commands) vs. reporting tabs (below it,
  // report-only). Each entry keeps its index in the server's full tab list for RPCs.
  const actionEntries = useMemo(() => tabs.map((tab, index) => ({ tab, index })).filter((e) => !isReportingTab(e.tab)), [tabs]);
  const reportingEntries = useMemo(() => tabs.map((tab, index) => ({ tab, index })).filter((e) => isReportingTab(e.tab)), [tabs]);

  const current = tabs[activeTab] ?? actionEntries[0]?.tab;
  currentRef.current = current;
  const lines = useMemo(() => current?.bufferLines ?? [], [current]);
  // The picker lists the tab's recent history, most recent at the bottom (suppressed when empty).
  const recent = useMemo(() => getRecentHistory(current?.cmdHistory ?? [], 10), [current]);

  // Live snapshot read by the window key handler, so it never has to re-register.
  const stateReference = useRef({ pickerOpen, pickerIdx: pickerIndex, recent, route, routeIdx: routeIndex });
  stateReference.current = { pickerOpen, pickerIdx: pickerIndex, recent, route, routeIdx: routeIndex };

  const runCommand = useCallback((text: string) => client.send({ method: 'command', params: { text } }), [client]);
  const openPicker = () => {
    // Always open on hist / Ctrl+R; highlight the most recent (bottom) entry.
    setPickerIndex(Math.max(0, stateReference.current.recent.length - 1));
    setPickerOpen(true);
  };
  const pick = (command: string) => { runCommand(command); setPickerOpen(false); };
  const { quitConfirmOpen, openQuitConfirm, confirmQuit, cancelQuit } = useQuitConfirm(runCommand, inputReference);

  const selectTab = (index: number) => client.send({ method: 'setActiveTab', params: { index } });

  const closeTab = (index: number) => client.send({ method: 'closeTab', params: { index } });

  const chooseRoute = useCallback((index: number) => client.send({ method: 'chooseRoute', params: { index } }), [client]);

  useEffect(() => client.onState((nextTabs, active, nextRoute, nextTabNameMaxLength) => {
    setTabs(nextTabs);
    setActiveTab(active);
    setRoute(nextRoute);
    setTabNameMaxLength(nextTabNameMaxLength);
    // Highlight the first option when a chooser newly opens (or its command changes).
    const previous = routeReference.current;
    routeReference.current = nextRoute;
    if (nextRoute && (!previous || previous.cmd !== nextRoute.cmd)) setRouteIndex(0);
  }), [client]);

  // Switching tabs: harness/shell PTY tabs focus the terminal; all others focus the command line.
  useEffect(() => {
    const cur = currentRef.current;
    const harnessPtyId = cur?.view === 'harness' ? cur.harness?.ptyId : undefined;
    if (harnessPtyId) harnessHandles.current.get(harnessPtyId)?.focus();
    else if (cur?.activePty) shellHandles.current.get(cur.activePty)?.focus();
    else inputReference.current?.focus();
  }, [activeTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const rc = stateReference.current.route;
      if (rc) {
        handleRouteChooserKey(e, rc, stateReference.current.routeIdx, setRouteIndex, chooseRoute);
        return;
      }
      if (stateReference.current.pickerOpen) {
        handlePickerKey(e, stateReference.current.recent, stateReference.current.pickerIdx, setPickerIndex, runCommand, setPickerOpen);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); openPicker(); return; }

      if (handleScrollKey(e)) return;
      // Shift+Arrow switches tabs, Ctrl+Arrow reorders within group, Ctrl+T toggles collapse.
      if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
      else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
      else if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
    };
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener('keyup', handleScrollKeyUp);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('keyup', handleScrollKeyUp);
    };
  }, [client, chooseRoute, runCommand, handleScrollKey, handleScrollKeyUp]);

  if (!current) return <div className="app" style={{ padding: 16, color: 'var(--muted)' }}>Connecting…</div>;

  const isViewTab = (['image', 'page', 'harness', 'markdown'] as const).includes(current.view as 'image' | 'page' | 'harness' | 'markdown');

  return (
    <div className="app">
      <TabStrip
        tabs={actionEntries.map((e) => e.tab)}
        activeTab={actionEntries.findIndex((e) => e.index === activeTab)}
        onSelect={(index) => selectTab(actionEntries[index].index)}
        onClose={(index) => closeTab(actionEntries[index].index)}
        onRename={(index, title) => client.renameTab(actionEntries[index].index, title)}
        tabNameMaxLength={tabNameMaxLength}
      />

      <ViewTabBody tab={current} />

      <ShellTabLayer tabs={tabs} activeLabel={current.label} client={client}
        onHandle={(id, h) => { if (h) shellHandles.current.set(id, h); else shellHandles.current.delete(id); }} />

      {/* Harness layer: all harness tabs stay mounted; only the active one is visible.
          This preserves xterm state (alternate buffer, cursor position) across tab switches.
          The schedule panel floats over the terminal so a harness's timers stay visible. */}
      {tabs.filter((t) => t.view === 'harness' && t.harness).map((t) => (
        <div
          key={t.harness!.ptyId}
          className="tab-body"
          style={{ borderLeft: `4px solid ${t.dotColor}`, position: 'relative', display: t.label === current.label ? 'flex' : 'none' }}
        >
          <HarnessTab harness={t.harness!} client={client}
            ref={(h) => { if (h) harnessHandles.current.set(t.harness!.ptyId, h); else harnessHandles.current.delete(t.harness!.ptyId); }} />
          <StatusPanels tab={t} scheduleOnly />
        </div>
      ))}

      {!isViewTab && !current.activePty && (
        <div
          className="tab-body"
          style={{ borderLeft: `4px solid ${current.dotColor}` }}
          onClick={() => inputReference.current?.focus()}
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
            />
            <StatusPanels tab={current} />
            {route && <RouteChooser cmd={route.cmd} choices={route.choices} selected={routeIndex} onPick={chooseRoute} />}
            {!route && pickerOpen && <HistoryPicker items={recent} selected={pickerIndex} onPick={pick} />}
          </div>
          <CommandInput
            dotColor={current.dotColor}
            history={current.cmdHistory}
            onSubmit={(text) => {
              const trimmed = text.trim().toLowerCase();
              // close/exit on the last tab quits the app, so confirm it like `quit`.
              const closesLastTab = (trimmed === 'close' || trimmed === 'exit') && tabs.length === 1;
              if (trimmed === 'hist') openPicker();
              else if (trimmed === 'quit' || closesLastTab) openQuitConfirm();
              else runCommand(text);
            }}
            inputRef={inputReference}
            complete={(text, cursor) => client.request({ method: 'complete', params: { text, cursor } })}
            pickerOpen={pickerOpen || route !== null || quitConfirmOpen}
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
    </div>
  );
}
