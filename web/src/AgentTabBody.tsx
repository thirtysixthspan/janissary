import React from 'react';
import type { TabView, RouteChooserView, BufferLine } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Transcript } from './transcript/Transcript';
import { StatusPanels } from './StatusPanels';
import { PickerOverlays } from './PickerOverlays';
import { CommandArea } from './command-input/CommandArea';
import type { CommandInputDropHandle } from './drop-handles';
import { AgentTabMeta } from './AgentTabMeta';
import type { useViewSearchState } from './useViewSearchState';
import type { VisibleTaskRow } from './task-picker-keys';
import type { VisibleProfileRow } from './profile-picker-keys';
import { useStatusWindows } from './useStatusWindows';
import { statusButton } from './status-button';
import type { FuzzyMatchResult } from './fuzzy-match';
import { tabBodyBorder } from './tab-body-border';
import { agentTabIntents } from './agent-tab-intents';

type Properties = {
  current: TabView;
  client: JanusClient;
  lines: BufferLine[];
  runCommand: (text: string) => void;
  transcriptReference: React.RefObject<HTMLDivElement | null>;
  highlight: ReturnType<typeof useViewSearchState>['highlight'];
  inputReference: React.RefObject<HTMLTextAreaElement | null>;
  route: RouteChooserView | null;
  routeIndex: number;
  chooseRoute: (index: number) => void;
  syntaxTheme: string;
  themePickerOpen: boolean;
  themePickerIndex: number;
  pickTheme: (theme: string) => void;
  theme: string;
  appThemePickerOpen: boolean;
  appThemePickerIndex: number;
  pickAppTheme: (theme: string) => void;
  pickerOpen: boolean;
  recent: string[];
  pickerIndex: number;
  pick: (text: string) => void;
  navOpen: boolean;
  navQuery: string;
  navIndex: number;
  tabs: TabView[];
  selectNavTab: (index: number) => void;
  queueOpen: boolean;
  queueIndex: number;
  selectQueueIndex: (index: number) => void;
  taskPickerOpen: boolean;
  visibleTasks: VisibleTaskRow[];
  taskPickerIndex: number;
  pickTask: (path: string) => void;
  toggleTaskDir: (path: string) => void;
  profilePickerOpen: boolean;
  profiles: VisibleProfileRow[];
  profilePickerIndex: number;
  pickProfile: (name: string) => void;
  quickOpenOpen: boolean;
  quickOpenQuery: string;
  setQuickOpenQuery: (query: string) => void;
  quickOpenResults: FuzzyMatchResult[];
  quickOpenIndex: number;
  setQuickOpenIndex: (index: number) => void;
  quickOpenLoading: boolean;
  pickQuickOpenFile: (relPath: string) => void;
  closeQuickOpen: () => void;
  search: ReturnType<typeof useViewSearchState>['search'];
  globalHistory: string[];
  onCommandBarSubmit: React.ComponentProps<typeof CommandArea>['onSubmit'];
  quitConfirmOpen: boolean;
  unsavedQuitOpen: boolean;
  recallReference: React.RefObject<((text: string) => void) | null>;
  onEditQueued: React.ComponentProps<typeof CommandArea>['onEditQueued'];
  onDeleteQueued: React.ComponentProps<typeof CommandArea>['onDeleteQueued'];
  dropRef: React.RefObject<CommandInputDropHandle | null>;
  onSplit?: () => void;
};

// The normal agent-tab body: transcript, status panels, picker overlays, and the command bar.
// Split out of App.tsx to keep it under the file-size limit.
export function AgentTabBody({
  current, client, lines, runCommand, transcriptReference, highlight, inputReference,
  route, routeIndex, chooseRoute, syntaxTheme, themePickerOpen, themePickerIndex, pickTheme,
  theme, appThemePickerOpen, appThemePickerIndex, pickAppTheme, pickerOpen, recent, pickerIndex, pick,
  navOpen, navQuery, navIndex, tabs, selectNavTab, queueOpen, queueIndex, selectQueueIndex,
  taskPickerOpen, visibleTasks, taskPickerIndex, pickTask, toggleTaskDir,
  profilePickerOpen, profiles, profilePickerIndex, pickProfile,
  quickOpenOpen, quickOpenQuery, setQuickOpenQuery, quickOpenResults, quickOpenIndex, setQuickOpenIndex,
  quickOpenLoading, pickQuickOpenFile, closeQuickOpen,
  search, globalHistory, onCommandBarSubmit, quitConfirmOpen, unsavedQuitOpen,
  recallReference, onEditQueued, onDeleteQueued, dropRef, onSplit,
}: Properties) {
  const statusWindows = useStatusWindows(current.label, current.connections.length > 0, current.schedule.length > 0);
  const intents = agentTabIntents(client, current.label);
  return (
    <div
      className="tab-body"
      style={{ borderLeft: tabBodyBorder(current.dotColor, true) }}
      onMouseUp={() => {
        const selection = globalThis.getSelection()?.toString();
        if (selection) { navigator.clipboard.writeText(selection); return; }
        inputReference.current?.focus();
      }}
    >
      <AgentTabMeta
        cwd={current.cwd}
        flags={current.flags}
        onOpenFileNavigator={intents.onOpenFileNavigator}
        onLaunchAgentHere={current.cwd === undefined ? undefined : intents.onLaunchAgentHere}
        onOpenTranscript={intents.onOpenTranscript}
        connectionsButton={{
          hasContent: current.connections.length > 0,
          onEnter: statusWindows.connections.onButtonEnter,
          onLeave: statusWindows.connections.onButtonLeave,
          onClick: statusWindows.connections.onButtonClick,
        }}
        scheduleButton={statusButton(current.schedule.length > 0, statusWindows.schedule)}
        onSplit={onSplit}
      />
      <div className="main">
        <Transcript
          lines={lines}
          client={client}
          onToggleCollapse={intents.onToggleCollapse}
          onPromptClick={(text) => runCommand(text)}
          scrollRef={transcriptReference}
          highlight={highlight}
        />
        <StatusPanels
          tab={current}
          connections={statusWindows.connections}
          schedule={statusWindows.schedule}
          interactive
          onOpenAcpTranscript={intents.onOpenAcpTranscript}
        />
        <PickerOverlays
          route={route} routeIndex={routeIndex} onPickRoute={chooseRoute}
          syntaxTheme={syntaxTheme} themePickerOpen={themePickerOpen} themePickerIndex={themePickerIndex} onPickTheme={pickTheme}
          theme={theme} appThemePickerOpen={appThemePickerOpen} appThemePickerIndex={appThemePickerIndex} onPickAppTheme={pickAppTheme}
          pickerOpen={pickerOpen} recent={recent} pickerIndex={pickerIndex} onPickHistory={pick}
          navOpen={navOpen} navQuery={navQuery} navIndex={navIndex} tabs={tabs} onPickTab={selectNavTab}
          queueOpen={queueOpen} queueItems={current.commandQueue} queueIndex={queueIndex} onSelectQueue={selectQueueIndex}
          taskPickerOpen={taskPickerOpen} taskRows={visibleTasks} taskPickerIndex={taskPickerIndex} onPickTask={pickTask} onToggleTaskDir={toggleTaskDir}
          profilePickerOpen={profilePickerOpen} profiles={profiles} profilePickerIndex={profilePickerIndex} onPickProfile={pickProfile}
          quickOpenOpen={quickOpenOpen} quickOpenQuery={quickOpenQuery} onChangeQuickOpenQuery={setQuickOpenQuery}
          quickOpenResults={quickOpenResults} quickOpenIndex={quickOpenIndex} onChangeQuickOpenIndex={setQuickOpenIndex}
          quickOpenLoading={quickOpenLoading} onPickQuickOpen={pickQuickOpenFile} onCloseQuickOpen={closeQuickOpen}
          commandInputRef={inputReference} />
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
        dropRef={dropRef}
      />
    </div>
  );
}
