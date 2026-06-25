import React from 'react';
import type { TabView } from './protocol';

type Props = {
  tabs: TabView[];
  activeTab: number;
  onSelect: (index: number) => void;
};

export function TabStrip({ tabs, activeTab, onSelect }: Props) {
  return (
    <div className="tabstrip">
      {tabs.map((tab, i) => (
        <div
          key={tab.label}
          className={`tab${i === activeTab ? ' active' : ''}`}
          style={{ borderTopColor: tab.groupColor }}
          onClick={() => onSelect(i)}
        >
          <span className={`dot${tab.busy ? ' busy' : ''}`} style={{ color: tab.dotColor }}>●</span>
          <span>{tab.label}</span>
        </div>
      ))}
    </div>
  );
}
