import React, { useState } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Sidebar } from './Sidebar';
import { DefaultContextMenu } from './context-menu/DefaultContextMenu';
import type { CommandInputDropHandle, EditorDropHandle } from './shared/drop-handles';
import { useConnectionStatus } from './useConnectionStatus';
import { ConnectionStatusLabel } from './ConnectionStatusLabel';
import { ToastStack } from './toasts/ToastStack';

// The root layout: left sidebar / center column (everything App renders today) / right sidebar.
// Split out of App.tsx to keep it under the file-size limit.
export function AppShell({
  tabs, client, children, dropRef, editorDropRef, targetCwd,
  notificationsVisible,
  tabNameMaxLength = 16, activeTabNameMaxLength = 50,
  sidebarLeftWidth, onSidebarLeftWidthChange, sidebarRightWidth, onSidebarRightWidthChange,
  focusLeft, focusRight,
}: {
  tabs: TabView[];
  notificationsVisible: boolean;
  client: JanusClient;
  children: React.ReactNode;
  dropRef?: React.RefObject<CommandInputDropHandle | null>;
  editorDropRef?: React.RefObject<EditorDropHandle | null>;
  targetCwd?: string;
  tabNameMaxLength?: number;
  activeTabNameMaxLength?: number;
  sidebarLeftWidth?: number;
  onSidebarLeftWidthChange?: (width: number) => void;
  sidebarRightWidth?: number;
  onSidebarRightWidthChange?: (width: number) => void;
  focusLeft?: 'files' | 'notifications';
  focusRight?: 'files' | 'notifications';
}) {
  const connectionStatus = useConnectionStatus(client);
  const [leftNotificationsVisible, setLeftNotificationsVisible] = useState(false);
  const [rightNotificationsVisible, setRightNotificationsVisible] = useState(false);
  const feedVisible = notificationsVisible || leftNotificationsVisible || rightNotificationsVisible;
  return (
    <div className="app">
      <Sidebar
        side="left" tabs={tabs} client={client} dropRef={dropRef} editorDropRef={editorDropRef}
        targetCwd={targetCwd} tabNameMaxLength={tabNameMaxLength}
        activeTabNameMaxLength={activeTabNameMaxLength}
        width={sidebarLeftWidth} onWidthChange={onSidebarLeftWidthChange} focusView={focusLeft}
        onNotificationsVisibilityChange={setLeftNotificationsVisible}
      />
      <div className="app-center"><ConnectionStatusLabel status={connectionStatus} />{children}</div>
      <Sidebar
        side="right" tabs={tabs} client={client} dropRef={dropRef} editorDropRef={editorDropRef}
        targetCwd={targetCwd} tabNameMaxLength={tabNameMaxLength}
        activeTabNameMaxLength={activeTabNameMaxLength}
        width={sidebarRightWidth} onWidthChange={onSidebarRightWidthChange} focusView={focusRight}
        onNotificationsVisibilityChange={setRightNotificationsVisible}
      />
      <DefaultContextMenu client={client} />
      <ToastStack client={client} notificationsVisible={feedVisible} />
    </div>
  );
}
