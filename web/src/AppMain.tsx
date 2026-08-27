import React from 'react';
import type { HarnessLaunchView, ScheduleLaunchView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { AgentTabBody } from './agent-tabs/AgentTabBody';
import { AppShell } from './AppShell';
import { AppCenterActionArea } from './AppCenterActionArea';
import { AppReportingSection } from './AppReportingSection';
import { HarnessLaunchDialog } from './harness/HarnessLaunchDialog';
import { ScheduleDialog } from './ScheduleDialog';
import { QuitDialog } from './QuitDialog/QuitDialog';
import { UnsavedQuitDialog } from './UnsavedQuitDialog';
import { CloseSaveGuard } from './CloseSaveGuard';
import type { TabEntry } from './tab-entries';
import type { LayoutState } from './useLayoutState';
import type { DirtyTabHandle, HarnessTabHandle, ShellTabHandle, QuestionPanelHandle } from './tab-handles';
import type { EditorDropHandle } from './drop-handles';

type AppMainProps = Omit<React.ComponentProps<typeof AgentTabBody>, 'onSplit'> & LayoutState & {
  activeTab: number;
  secondaryTab?: number;
  windowFocused: boolean;
  actionEntries: TabEntry[];
  reportingEntries: TabEntry[];
  closeTab: (index: number) => void;
  tabNameMaxLength: number;
  activeTabNameMaxLength: number;
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>;
  shellHandles: React.RefObject<Map<string, ShellTabHandle>>;
  questionPanelRef: React.RefObject<QuestionPanelHandle | null>;
  tabHandles: React.RefObject<Map<string, DirtyTabHandle>>;
  editorDropReference: React.RefObject<EditorDropHandle | null>;
  dirtyPluginTabs: ReadonlySet<string>;
  onPluginDirty: (label: string, dirty: boolean) => void;
  harnessLaunch: HarnessLaunchView | null;
  scheduleLaunch: ScheduleLaunchView | null;
  confirmQuit: () => void;
  cancelQuit: () => void;
  confirmUnsavedQuit: () => void;
  cancelUnsavedQuit: () => void;
  guardRef: React.RefObject<((index: number) => boolean) | null>;
  client: JanusClient;
};

// The root render tree: the focused agent body plus the shell/sidebars/dialogs around it.
// Split out of App.tsx to keep it under the file-size limit.
export function AppMain({
  current, client, lines, runCommand, transcriptReference, highlight, inputReference,
  route, routeIndex, chooseRoute, syntaxTheme, themePickerOpen, themePickerIndex, pickTheme,
  theme, appThemePickerOpen, appThemePickerIndex, pickAppTheme, pickerOpen, recent, pickerIndex, pick,
  navOpen, navQuery, navIndex, tabs, selectNavTab, queueOpen, queueIndex, selectQueueIndex,
  taskPickerOpen, visibleTasks, taskPickerIndex, pickTask, toggleTaskDir,
  profilePickerOpen, profiles, profilePickerIndex, pickProfile,
  quickOpenOpen, quickOpenQuery, setQuickOpenQuery, quickOpenResults, quickOpenIndex, setQuickOpenIndex,
  quickOpenLoading, pickQuickOpenFile, closeQuickOpen,
  search, globalHistory, onCommandBarSubmit, quitConfirmOpen, unsavedQuitOpen,
  recallReference, onEditQueued, onDeleteQueued, dropRef,
  activeTab, secondaryTab, windowFocused, actionEntries, reportingEntries, closeTab,
  tabNameMaxLength, activeTabNameMaxLength,
  sidebarLeftWidth, setSidebarLeftWidth, sidebarRightWidth, setSidebarRightWidth,
  reportingHeightPct, setReportingHeightPct, focusLeft, focusRight,
  harnessHandles, shellHandles, questionPanelRef, tabHandles, editorDropReference,
  dirtyPluginTabs, onPluginDirty,
  harnessLaunch, scheduleLaunch, confirmQuit, cancelQuit, confirmUnsavedQuit, cancelUnsavedQuit,
  guardRef,
}: AppMainProps) {
  const focusedAgentBody = (
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
      dropRef={dropRef}
      onSplit={() => client.send({ method: 'moveTabToOtherPane', params: { index: activeTab } })}
    />
  );

  return (
    <AppShell
      tabs={tabs} client={client} dropRef={dropRef} editorDropRef={editorDropReference} tabNameMaxLength={tabNameMaxLength}
      targetCwd={current.cwd}
      activeTabNameMaxLength={activeTabNameMaxLength}
      sidebarLeftWidth={sidebarLeftWidth} onSidebarLeftWidthChange={setSidebarLeftWidth}
      sidebarRightWidth={sidebarRightWidth} onSidebarRightWidthChange={setSidebarRightWidth}
      focusLeft={focusLeft} focusRight={focusRight}
    >
      <AppCenterActionArea
        entries={actionEntries} tabs={tabs} activeTab={activeTab} secondaryTab={secondaryTab}
        client={client} closeTab={closeTab} tabNameMaxLength={tabNameMaxLength}
        activeTabNameMaxLength={activeTabNameMaxLength}
        onFocusCommandBar={() => inputReference.current?.focus()}
        onFocusEditor={(label) => tabHandles.current.get(label)?.focus()}
        windowFocused={windowFocused} current={current} focusedAgentBody={focusedAgentBody}
        dirtyTabs={dirtyPluginTabs}
        shellProps={{
          onHandle: (id, handle) => {
            if (handle) shellHandles.current.set(id, handle);
            else shellHandles.current.delete(id);
          },
        }}
        mountedProps={{
          harnessHandles, tabHandles, editorDropRef: editorDropReference, questionPanelRef,
          onPluginDirty,
          taskPickerOpen, taskRows: visibleTasks, taskPickerIndex, onPickTask: pickTask,
          onToggleTaskDir: toggleTaskDir, navOpen, navQuery, navIndex, onPickTab: selectNavTab,
        }}
      />
      <AppReportingSection entries={reportingEntries} client={client} onClose={closeTab}
        heightPct={reportingHeightPct} onHeightPctChange={setReportingHeightPct} />
      {harnessLaunch && <HarnessLaunchDialog view={harnessLaunch} client={client} />}
      {scheduleLaunch && <ScheduleDialog view={scheduleLaunch} client={client} />}
      {quitConfirmOpen && <QuitDialog onConfirm={confirmQuit} onCancel={cancelQuit} />}
      {unsavedQuitOpen && <UnsavedQuitDialog onConfirm={confirmUnsavedQuit} onCancel={cancelUnsavedQuit} />}
      <CloseSaveGuard tabs={tabs} tabHandles={tabHandles} client={client} guardRef={guardRef} />
    </AppShell>
  );
}
