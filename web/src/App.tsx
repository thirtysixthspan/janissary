import React, { useEffect, useMemo, useRef, useState } from 'react';
import { JanusClient } from './ws';
import type { TabView, RouteChooserView } from './protocol';
import { TabStrip } from './TabStrip';
import { Transcript } from './Transcript';
import { CommandInput } from './CommandInput';
import { StatusPanels } from './StatusPanels';
import { HistoryPicker } from './HistoryPicker';
import { RouteChooser } from './RouteChooser';
import { getRecentHistory } from './history';

export function App() {
  const clientRef = useRef<JanusClient | null>(null);
  if (!clientRef.current) clientRef.current = new JanusClient();
  const client = clientRef.current;

  const [tabs, setTabs] = useState<TabView[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIdx, setPickerIdx] = useState(0);
  // Server-driven route chooser (null when closed); `routeIdx` is the highlighted option.
  const [route, setRoute] = useState<RouteChooserView | null>(null);
  const [routeIdx, setRouteIdx] = useState(0);
  const routeRef = useRef<RouteChooserView | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const cur = tabs[activeTab] ?? tabs[0];
  const lines = useMemo(() => cur?.bufferLines ?? [], [cur]);
  // The picker lists the tab's recent history, most recent at the bottom (suppressed when empty).
  const recent = useMemo(() => getRecentHistory(cur?.cmdHistory ?? [], 10), [cur]);

  // Live snapshot read by the window key handler, so it never has to re-register.
  const stateRef = useRef({ pickerOpen, pickerIdx, recent, route, routeIdx });
  stateRef.current = { pickerOpen, pickerIdx, recent, route, routeIdx };

  const runCommand = (text: string) => client.send({ method: 'command', params: { text } });
  const openPicker = () => {
    // Always open on hist / Ctrl+R; highlight the most recent (bottom) entry.
    setPickerIdx(Math.max(0, stateRef.current.recent.length - 1));
    setPickerOpen(true);
  };
  const pick = (cmd: string) => { runCommand(cmd); setPickerOpen(false); };

  const selectTab = (index: number) => {
    client.send({ method: 'setActiveTab', params: { index } });
    inputRef.current?.focus();
  };

  const chooseRoute = (index: number) => client.send({ method: 'chooseRoute', params: { index } });

  useEffect(() => client.onState((nextTabs, active, nextRoute) => {
    setTabs(nextTabs);
    setActiveTab(active);
    setRoute(nextRoute);
    // Highlight the first option when a chooser newly opens (or its command changes).
    const prev = routeRef.current;
    routeRef.current = nextRoute;
    if (nextRoute && (!prev || prev.cmd !== nextRoute.cmd)) setRouteIdx(0);
  }), [client]);

  // Switching tabs (click, Shift+Arrow, `next`, reorder) returns focus to the command line.
  useEffect(() => { inputRef.current?.focus(); }, [activeTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Route chooser is modal while open: Up/Down move, Return runs the chosen route, Escape cancels.
      const rc = stateRef.current.route;
      if (rc) {
        if (e.key === 'ArrowUp') { e.preventDefault(); setRouteIdx((i) => Math.max(0, i - 1)); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setRouteIdx((i) => Math.min(rc.choices.length - 1, i + 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); chooseRoute(stateRef.current.routeIdx); }
        else if (e.key === 'Escape') { e.preventDefault(); chooseRoute(-1); }
        return;
      }
      // History picker is modal while open: Up/Down move, Return runs, Escape closes.
      if (stateRef.current.pickerOpen) {
        const items = stateRef.current.recent;
        if (e.key === 'ArrowUp') { e.preventDefault(); setPickerIdx((i) => Math.max(0, i - 1)); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setPickerIdx((i) => Math.min(items.length - 1, i + 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); const cmd = items[stateRef.current.pickerIdx]; if (cmd) runCommand(cmd); setPickerOpen(false); }
        else if (e.key === 'Escape') { e.preventDefault(); setPickerOpen(false); }
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); openPicker(); return; }

      // Transcript scrolling: PageUp/Down half-screen, Ctrl+Up/Down (or Ctrl+P/N) one line,
      // Escape jumps back to the bottom.
      const el = transcriptRef.current;
      if (el) {
        const line = 22;
        if (e.key === 'PageUp') { e.preventDefault(); el.scrollTop -= el.clientHeight / 2; return; }
        if (e.key === 'PageDown') { e.preventDefault(); el.scrollTop += el.clientHeight / 2; return; }
        if (e.ctrlKey && (e.key === 'ArrowUp' || e.key.toLowerCase() === 'p')) { e.preventDefault(); el.scrollTop -= line; return; }
        if (e.ctrlKey && (e.key === 'ArrowDown' || e.key.toLowerCase() === 'n')) { e.preventDefault(); el.scrollTop += line; return; }
        if (e.key === 'Escape') { e.preventDefault(); el.scrollTop = el.scrollHeight; return; }
      }
      // Shift+Arrow switches tabs, Ctrl+Arrow reorders within group, Ctrl+T toggles collapse.
      if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
      else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
      else if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client]);

  if (!cur) return <div className="app" style={{ padding: 16, color: 'var(--muted)' }}>Connecting…</div>;

  return (
    <div className="app">
      <TabStrip tabs={tabs} activeTab={activeTab} onSelect={selectTab} />
      <div
        className="tab-body"
        style={{ borderLeft: `4px solid ${cur.dotColor}` }}
        onClick={() => inputRef.current?.focus()}
        onMouseUp={() => {
          const selection = window.getSelection()?.toString();
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
            scrollRef={transcriptRef}
          />
          <StatusPanels tab={cur} />
          {route && <RouteChooser cmd={route.cmd} choices={route.choices} selected={routeIdx} onPick={chooseRoute} />}
          {!route && pickerOpen && <HistoryPicker items={recent} selected={pickerIdx} onPick={pick} />}
        </div>
        <CommandInput
          dotColor={cur.dotColor}
          history={cur.cmdHistory}
          onSubmit={(text) => { if (text.trim().toLowerCase() === 'hist') openPicker(); else runCommand(text); }}
          inputRef={inputRef}
          complete={(text, cursor) => client.request({ method: 'complete', params: { text, cursor } })}
          pickerOpen={pickerOpen || route !== null}
        />
      </div>
    </div>
  );
}
