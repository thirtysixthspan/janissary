import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Sidebar } from './Sidebar';
import type { CommandInputDropHandle } from './CommandInput';

// The root layout: left sidebar / center column (everything App renders today) / right sidebar.
// Split out of App.tsx to keep it under the file-size limit.
export function AppShell({
  tabs, client, children, dropRef, tabNameMaxLength = 16, activeTabNameMaxLength = 50,
  sidebarLeftWidth, onSidebarLeftWidthChange, sidebarRightWidth, onSidebarRightWidthChange,
  focusLeft, focusRight,
}: {
  tabs: TabView[];
  client: JanusClient;
  children: React.ReactNode;
  dropRef?: React.RefObject<CommandInputDropHandle | null>;
  tabNameMaxLength?: number;
  activeTabNameMaxLength?: number;
  sidebarLeftWidth?: number;
  onSidebarLeftWidthChange?: (width: number) => void;
  sidebarRightWidth?: number;
  onSidebarRightWidthChange?: (width: number) => void;
  focusLeft?: 'files' | 'notifications' | 'schedules';
  focusRight?: 'files' | 'notifications' | 'schedules';
}) {
  return (
    <div className="app">
      <Sidebar
        side="left" tabs={tabs} client={client} dropRef={dropRef} tabNameMaxLength={tabNameMaxLength}
        activeTabNameMaxLength={activeTabNameMaxLength}
        width={sidebarLeftWidth} onWidthChange={onSidebarLeftWidthChange} focusView={focusLeft}
      />
      <div className="app-center">{children}</div>
      <Sidebar
        side="right" tabs={tabs} client={client} dropRef={dropRef} tabNameMaxLength={tabNameMaxLength}
        activeTabNameMaxLength={activeTabNameMaxLength}
        width={sidebarRightWidth} onWidthChange={onSidebarRightWidthChange} focusView={focusRight}
      />
    </div>
  );
}
