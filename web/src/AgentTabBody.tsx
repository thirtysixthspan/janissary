import React from 'react';
import type { TabView, RouteChooserView, BufferLine } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Transcript } from './Transcript';
import { StatusPanels } from './StatusPanels';
import { PickerOverlays } from './PickerOverlays';
import { CommandArea } from './CommandArea';
import type { CommandInputDropHandle } from './CommandInput';
import { AgentTabMeta } from './AgentTabMeta';
import type { useViewSearchState } from './useViewSearchState';
import type { VisibleTaskRow } from './task-picker-keys';

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
  profiles: string[];
  profilePickerIndex: number;
  pickProfile: (name: string) => void;
  search: ReturnType<typeof useViewSearchState>['search'];
  globalHistory: string[];
  onCommandBarSubmit: React.ComponentProps<typeof CommandArea>['onSubmit'];
  quitConfirmOpen: boolean;
  unsavedQuitOpen: boolean;
  recallReference: React.RefObject<((text: string) => void) | null>;
  onEditQueued: React.ComponentProps<typeof CommandArea>['onEditQueued'];
  onDeleteQueued: React.ComponentProps<typeof CommandArea>['onDeleteQueued'];
  dropRef: React.RefObject<CommandInputDropHandle | null>;
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
  search, globalHistory, onCommandBarSubmit, quitConfirmOpen, unsavedQuitOpen,
  recallReference, onEditQueued, onDeleteQueued, dropRef,
}: Properties) {
  return (
    <div
      className="tab-body"
      style={{ borderLeft: `4px solid ${current.dotColor}` }}
      onMouseUp={() => {
        const selection = globalThis.getSelection()?.toString();
        if (selection) { navigator.clipboard.writeText(selection); return; }
        inputReference.current?.focus();
      }}
    >
      <AgentTabMeta
        cwd={current.cwd}
        flags={current.flags}
        onOpenFileNavigator={() => client.send({ method: 'openFileNavigatorFor', params: { label: current.label } })}
        onLaunchAgentHere={current.cwd === undefined ? undefined : () => client.send({ method: 'launchAgentFor', params: { label: current.label } })}
      />
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
        dropRef={dropRef}
      />
    </div>
  );
}
