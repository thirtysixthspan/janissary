import React from 'react';
import type { HarnessLaunchView, ScheduleLaunchView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { AgentTabBody } from './agent-tabs/AgentTabBody';
import { AppShell } from './AppShell';
import { AppCenterActionArea } from './AppCenterActionArea';
import { AppReportingSection } from './AppReportingSection';
import { HarnessLaunchDialog } from './harness/HarnessLaunchDialog';
import { ScheduleDialog } from './plugins/schedules/ScheduleDialog';
import { QuitDialog } from './QuitDialog/QuitDialog';
import { UnsavedQuitDialog } from './UnsavedQuitDialog';
import { CloseSaveGuard } from './CloseSaveGuard';
import { PickerOverlays } from './pickers/PickerOverlays';
import type { TabEntry } from './tab-entries';
import type { LayoutState } from './useLayoutState';
import type { DirtyTabHandle, HarnessTabHandle, ShellTabHandle, QuestionPanelHandle } from './tab-handles';
import type { EditorDropHandle } from './drop-handles';

type PickerProperties = Omit<React.ComponentProps<typeof PickerOverlays>, 'queueItems' | 'commandInputRef'>;

type AppMainProps = Omit<
  React.ComponentProps<typeof AgentTabBody>,
  'onSplit' | 'pickerOverlays' | 'blockingOverlayOpen'
> & PickerProperties & LayoutState & {
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
  route, routeIndex, onPickRoute, syntaxTheme, themePickerOpen, themePickerIndex, onPickTheme,
  theme, appThemePickerOpen, appThemePickerIndex, onPickAppTheme, pickerOpen, recent, pickerIndex, onPickHistory,
  navOpen, navQuery, navIndex, tabs, onPickTab, queueOpen, queueIndex, onSelectQueue,
  taskPickerOpen, taskRows, taskPickerIndex, onPickTask, onToggleTaskDir,
  profilePickerOpen, profiles, profilePickerIndex, onPickProfile,
  quickOpenOpen, quickOpenQuery, onChangeQuickOpenQuery, quickOpenResults, quickOpenIndex, onChangeQuickOpenIndex,
  quickOpenLoading, onPickQuickOpen, onCloseQuickOpen,
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
  const pickerOverlays = (
    <PickerOverlays
      route={route} routeIndex={routeIndex} onPickRoute={onPickRoute}
      syntaxTheme={syntaxTheme} themePickerOpen={themePickerOpen} themePickerIndex={themePickerIndex} onPickTheme={onPickTheme}
      theme={theme} appThemePickerOpen={appThemePickerOpen} appThemePickerIndex={appThemePickerIndex} onPickAppTheme={onPickAppTheme}
      pickerOpen={pickerOpen} recent={recent} pickerIndex={pickerIndex} onPickHistory={onPickHistory}
      navOpen={navOpen} navQuery={navQuery} navIndex={navIndex} tabs={tabs} onPickTab={onPickTab}
      queueOpen={queueOpen} queueItems={current.commandQueue} queueIndex={queueIndex} onSelectQueue={onSelectQueue}
      taskPickerOpen={taskPickerOpen} taskRows={taskRows} taskPickerIndex={taskPickerIndex}
      onPickTask={onPickTask} onToggleTaskDir={onToggleTaskDir}
      profilePickerOpen={profilePickerOpen} profiles={profiles} profilePickerIndex={profilePickerIndex} onPickProfile={onPickProfile}
      quickOpenOpen={quickOpenOpen} quickOpenQuery={quickOpenQuery} onChangeQuickOpenQuery={onChangeQuickOpenQuery}
      quickOpenResults={quickOpenResults} quickOpenIndex={quickOpenIndex} onChangeQuickOpenIndex={onChangeQuickOpenIndex}
      quickOpenLoading={quickOpenLoading} onPickQuickOpen={onPickQuickOpen} onCloseQuickOpen={onCloseQuickOpen}
      commandInputRef={inputReference}
    />
  );
  const focusedAgentBody = (
    <AgentTabBody
        current={current} client={client} lines={lines} runCommand={runCommand}
        transcriptReference={transcriptReference} highlight={highlight} inputReference={inputReference}
        pickerOverlays={pickerOverlays}
        blockingOverlayOpen={pickerOpen || route !== null || themePickerOpen || appThemePickerOpen || navOpen || taskPickerOpen || profilePickerOpen}
        queueOpen={queueOpen}
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
          taskPickerOpen, taskRows, taskPickerIndex, onPickTask,
          onToggleTaskDir, navOpen, navQuery, navIndex, onPickTab,
        }}
      />
      <AppReportingSection entries={reportingEntries} client={client} onClose={closeTab}
        heightPct={reportingHeightPct} onHeightPctChange={setReportingHeightPct} />
      {harnessLaunch && <HarnessLaunchDialog view={harnessLaunch} client={client} />}
      {scheduleLaunch && (
        <ScheduleDialog
          targets={scheduleLaunch.targets}
          activeTarget={scheduleLaunch.active}
          onSubmit={(text) => client.send({ method: 'command', params: { text } })}
          onCancel={() => client.send({ method: 'closeScheduleLaunch', params: {} })}
        />
      )}
      {quitConfirmOpen && <QuitDialog onConfirm={confirmQuit} onCancel={cancelQuit} />}
      {unsavedQuitOpen && <UnsavedQuitDialog onConfirm={confirmUnsavedQuit} onCancel={cancelUnsavedQuit} />}
      <CloseSaveGuard tabs={tabs} tabHandles={tabHandles} client={client} guardRef={guardRef} />
    </AppShell>
  );
}
