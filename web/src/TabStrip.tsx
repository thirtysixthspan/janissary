import React from 'react';
import type { TabView } from './protocol';

type Props = {
  tabs: TabView[];
  activeTab: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
};

export function TabStrip({ tabs, activeTab, onSelect, onClose }: Props) {
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
          <span>{tab.title ?? tab.label}</span>
          {tab.view === 'image' && (
            <button
              type="button"
              className="tab-close"
              title="Close tab"
              aria-label="Close tab"
              onClick={(e) => { e.stopPropagation(); onClose(i); }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
