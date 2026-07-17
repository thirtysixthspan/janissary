import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { TabView } from '@shared/protocol';
import { statusDotIcon, unreadIcon } from './icons';

// Shared with TabStrip, which passes these straight through to each TabItem it renders.
export type TabItemActions = {
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onRename: (index: number, title: string) => void;
  tabNameMaxLength: number;
  onFocusCommandBar?: () => void;
};

type Properties = TabItemActions & {
  tab: TabView;
  index: number;
  active: boolean;
  windowFocused?: boolean;
};

export function TabItem({ tab, index, active, onSelect, onClose, onRename, tabNameMaxLength, onFocusCommandBar, windowFocused = true }: Properties) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Escape cancels and blurs the input; the resulting blur event must not also commit.
  const cancelledRef = useRef(false);

  const startEdit = () => { cancelledRef.current = false; setDraft(tab.title ?? tab.label); setEditing(true); };

  const commit = () => {
    if (cancelledRef.current) return;
    setEditing(false);
    onRename(index, draft);
  };

  const cancel = () => { cancelledRef.current = true; setEditing(false); };

  // Dimmed when the window itself lacks OS focus (switched to another app/browser tab) — a
  // uniform cue independent of which in-app tab is active (see tabs.md's "never faded" rule).
  const borderColor = windowFocused ? tab.groupColor : `color-mix(in srgb, ${tab.groupColor} 60%, transparent)`;

  return (
    <div
      className={`tab${active ? ' active' : ''}`}
      style={{ borderTopColor: borderColor }}
      onMouseDown={() => { onFocusCommandBar?.(); onSelect(index); }}
    >
      <span className={`dot${tab.busy ? ' busy' : ''}`} style={{ color: tab.dotColor }}><FontAwesomeIcon icon={statusDotIcon} /></span>
      {editing ? (
        <input
          className="tab-rename-input"
          value={draft}
          maxLength={tabNameMaxLength}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.currentTarget.value.slice(0, tabNameMaxLength))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.currentTarget.blur(); }
            else if (e.key === 'Escape') { cancel(); }
          }}
        />
      ) : (
        <span onDoubleClick={(e) => {
          if (!active) return;
          e.stopPropagation();
          startEdit();
        }}
        >{tab.title ?? tab.label}</span>
      )}
      {tab.hasUnread && <span className="tab-badge" role="img" aria-label="unread"><FontAwesomeIcon icon={unreadIcon} /></span>}
      <button
        type="button"
        className="tab-close"
        title="Close tab"
        aria-label="Close tab"
        onClick={(e) => { e.stopPropagation(); onClose(index); }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </div>
  );
}
