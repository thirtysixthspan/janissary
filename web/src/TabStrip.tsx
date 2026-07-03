import React from 'react';
import type { TabView } from '@shared/protocol';
import { TabItem } from './TabItem';

type Properties = {
  tabs: TabView[];
  activeTab: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onRename: (index: number, title: string) => void;
  tabNameMaxLength: number;
};

export function TabStrip({ tabs, activeTab, onSelect, onClose, onRename, tabNameMaxLength }: Properties) {
  return (
    <div className="tabstrip">
      {tabs.map((tab, index) => (
        <TabItem
          key={tab.label}
          tab={tab}
          index={index}
          active={index === activeTab}
          onSelect={onSelect}
          onClose={onClose}
          onRename={onRename}
          tabNameMaxLength={tabNameMaxLength}
        />
      ))}
    </div>
  );
}
