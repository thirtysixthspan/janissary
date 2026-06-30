import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JanusClient } from './ws';
import type { TabView, RouteChooserView } from '@shared/protocol';
import { TabStrip } from './TabStrip';
import { Transcript } from './Transcript';
import { ViewTabBody } from './ViewTabBody';
import { HarnessTab, type HarnessTabHandle } from './HarnessTab';
import type { ShellTabHandle } from './ShellTab';
import { ShellTabLayer } from './ShellTabLayer';
import { CommandInput } from './CommandInput';
import { StatusPanels } from './StatusPanels';
import { HistoryPicker } from './HistoryPicker';
import { RouteChooser } from './RouteChooser';
import { getRecentHistory } from './history';

export function App() {
  const clientReference = useRef<JanusClient | null>(null);
  clientReference.current ??= new JanusClient();
  const client = clientReference.current;

  const [tabs, setTabs] = useState<TabView[]>([]);
  const [activeTab, setActiveTab] = useState(0);
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
  const scrollAccel = useRef<{ start: number; dir: -1 | 1 } | null>(null);

  const current = tabs[activeTab] ?? tabs[0];
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

  const selectTab = (index: number) => client.send({ method: 'setActiveTab', params: { index } });

  const closeTab = (index: number) => client.send({ method: 'closeTab', params: { index } });

  const chooseRoute = useCallback((index: number) => client.send({ method: 'chooseRoute', params: { index } }), [client]);

  useEffect(() => client.onState((nextTabs, active, nextRoute) => {
    setTabs(nextTabs);
    setActiveTab(active);
    setRoute(nextRoute);
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
      // Route chooser is modal while open: Up/Down move, Return runs the chosen route, Escape cancels.
      const rc = stateReference.current.route;
      if (rc) {
        switch (e.key) {
        case 'ArrowUp': { e.preventDefault(); setRouteIndex((index) => Math.max(0, index - 1)); 
        break;
        }
        case 'ArrowDown': { e.preventDefault(); setRouteIndex((index) => Math.min(rc.choices.length - 1, index + 1)); 
        break;
        }
        case 'Enter': { e.preventDefault(); chooseRoute(stateReference.current.routeIdx); 
        break;
        }
        case 'Escape': { e.preventDefault(); chooseRoute(-1); 
        break;
        }
        // No default
        }
        return;
      }
      // History picker is modal while open: Up/Down move, Return runs, Escape closes.
      if (stateReference.current.pickerOpen) {
        const items = stateReference.current.recent;
        switch (e.key) {
        case 'ArrowUp': { e.preventDefault(); setPickerIndex((index) => Math.max(0, index - 1)); 
        break;
        }
        case 'ArrowDown': { e.preventDefault(); setPickerIndex((index) => Math.min(items.length - 1, index + 1)); 
        break;
        }
        case 'Enter': { e.preventDefault(); const command = items[stateReference.current.pickerIdx]; if (command) runCommand(command); setPickerOpen(false); 
        break;
        }
        case 'Escape': { e.preventDefault(); setPickerOpen(false); 
        break;
        }
        // No default
        }
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); openPicker(); return; }

      // Transcript scrolling: PageUp/Down half-screen, Shift/Ctrl+Up/Down one line (with
      // acceleration that doubles every second while held), Escape jumps back to the bottom.
      const element = transcriptReference.current;
      if (element) {
        if (e.key === 'PageUp') { e.preventDefault(); element.scrollTop -= element.clientHeight / 2; return; }
        if (e.key === 'PageDown') { e.preventDefault(); element.scrollTop += element.clientHeight / 2; return; }
        if ((e.shiftKey || e.ctrlKey) && e.key === 'ArrowUp') {
          e.preventDefault();
          if (!scrollAccel.current || scrollAccel.current.dir !== -1) scrollAccel.current = { start: Date.now(), dir: -1 };
          const elapsed = Date.now() - scrollAccel.current.start;
          const step = Math.min(220, Math.max(22, Math.round(22 * Math.pow(2, elapsed / 1000))));
          element.scrollTop -= step;
          return;
        }
        if ((e.shiftKey || e.ctrlKey) && e.key === 'ArrowDown') {
          e.preventDefault();
          if (!scrollAccel.current || scrollAccel.current.dir !== 1) scrollAccel.current = { start: Date.now(), dir: 1 };
          const elapsed = Date.now() - scrollAccel.current.start;
          const step = Math.min(220, Math.max(22, Math.round(22 * Math.pow(2, elapsed / 1000))));
          element.scrollTop += step;
          return;
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); element.scrollTop -= 22; return; }
        if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); element.scrollTop += 22; return; }
        if (e.key === 'Escape') { e.preventDefault(); element.scrollTop = element.scrollHeight; return; }
      }
      // Shift+Arrow switches tabs, Ctrl+Arrow reorders within group, Ctrl+T toggles collapse.
      if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
      else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
      else if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') scrollAccel.current = null;
    };
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener('keyup', onUp);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('keyup', onUp);
    };
  }, [client, chooseRoute, runCommand]);

  if (!current) return <div className="app" style={{ padding: 16, color: 'var(--muted)' }}>Connecting…</div>;

  const isViewTab = (['image', 'page', 'harness', 'markdown'] as const).includes(current.view as 'image' | 'page' | 'harness' | 'markdown');

  return (
    <div className="app">
      <TabStrip tabs={tabs} activeTab={activeTab} onSelect={selectTab} onClose={closeTab} />

      <ViewTabBody tab={current} />

      <ShellTabLayer tabs={tabs} activeLabel={current.label} client={client}
        onHandle={(id, h) => { if (h) shellHandles.current.set(id, h); else shellHandles.current.delete(id); }} />

      {/* Harness layer: all harness tabs stay mounted; only the active one is visible.
          This preserves xterm state (alternate buffer, cursor position) across tab switches. */}
      {tabs.filter((t) => t.view === 'harness' && t.harness).map((t) => (
        <div
          key={t.harness!.ptyId}
          className="tab-body"
          style={{ borderLeft: `4px solid ${t.dotColor}`, display: t.label === current.label ? 'flex' : 'none' }}
        >
          <HarnessTab harness={t.harness!} client={client}
            ref={(h) => { if (h) harnessHandles.current.set(t.harness!.ptyId, h); else harnessHandles.current.delete(t.harness!.ptyId); }} />
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
              scrollRef={transcriptReference}
            />
            <StatusPanels tab={current} />
            {route && <RouteChooser cmd={route.cmd} choices={route.choices} selected={routeIndex} onPick={chooseRoute} />}
            {!route && pickerOpen && <HistoryPicker items={recent} selected={pickerIndex} onPick={pick} />}
          </div>
          <CommandInput
            dotColor={current.dotColor}
            history={current.cmdHistory}
            onSubmit={(text) => { if (text.trim().toLowerCase() === 'hist') openPicker(); else runCommand(text); }}
            inputRef={inputReference}
            complete={(text, cursor) => client.request({ method: 'complete', params: { text, cursor } })}
            pickerOpen={pickerOpen || route !== null}
          />
        </div>
      )}
    </div>
  );
}
