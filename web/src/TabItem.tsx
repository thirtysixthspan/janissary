import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { TabView } from '@shared/protocol';
import { TAB_RENAME_MAX_LENGTH } from '@shared/config';
import { statusDotIcon, unreadIcon } from './icons';
import { InlineEditInput } from './InlineEditInput';
import { truncateTabLabel } from './tab-label';

// Shared with TabStrip, which passes these straight through to each TabItem it renders.
export type TabItemActions = {
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onRename: (index: number, title: string) => void;
  tabNameMaxLength: number;
  activeTabNameMaxLength?: number;
  onFocusCommandBar?: () => void;
  onFocusEditor?: (label: string) => void;
};

type Properties = TabItemActions & {
  tab: TabView;
  index: number;
  active: boolean;
  windowFocused?: boolean;
};

export function TabItem({
  tab, index, active, onSelect, onClose, onRename, tabNameMaxLength,
  activeTabNameMaxLength = 50, onFocusCommandBar, onFocusEditor, windowFocused = true,
}: Properties) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Escape cancels and blurs the input; the resulting blur event must not also commit.
  const cancelledRef = useRef(false);
  // A click that focuses an inactive tab must not also count as half of a rename double-click,
  // even though `active` flips true (via onSelect) before the browser's dblclick event fires.
  const gestureStartedInactiveRef = useRef(false);

  const fullName = tab.editor?.name ?? tab.markdown?.name ?? tab.image?.name ?? tab.title ?? tab.label;
  const displayName = truncateTabLabel(fullName, active ? activeTabNameMaxLength : tabNameMaxLength);
  const startEdit = () => { cancelledRef.current = false; setDraft(fullName); setEditing(true); };

  const commit = () => {
    if (cancelledRef.current) return;
    setEditing(false);
    onRename(index, draft);
    onFocusEditor?.(tab.label);
  };

  const cancel = () => { cancelledRef.current = true; setEditing(false); };

  // Dimmed when the window itself lacks OS focus (switched to another app/browser tab) — a
  // uniform cue independent of which in-app tab is active (see tabs.md's "never faded" rule).
  const borderColor = windowFocused ? tab.groupColor : `color-mix(in srgb, ${tab.groupColor} 60%, transparent)`;

  return (
    <div
      className={`tab${active ? ' active' : ''}`}
      style={{ borderTopColor: borderColor }}
      onMouseDown={(e) => {
        if (e.detail <= 1) gestureStartedInactiveRef.current = !active;
        onFocusCommandBar?.();
        onSelect(index);
      }}
    >
      <span className={`dot${tab.busy ? ' busy' : ''}`} style={{ color: tab.dotColor }}><FontAwesomeIcon icon={statusDotIcon} /></span>
      {editing ? (
        <InlineEditInput
          className="tab-rename-input"
          value={draft}
          maxLength={TAB_RENAME_MAX_LENGTH}
          size={Math.max(draft.length, 1)}
          onClick={(e) => e.stopPropagation()}
          onChange={(v) => setDraft(v.slice(0, TAB_RENAME_MAX_LENGTH))}
          onCommit={commit}
          onCancel={cancel}
        />
      ) : (
        <span onDoubleClick={(e) => {
          if (!active || gestureStartedInactiveRef.current) return;
          e.stopPropagation();
          startEdit();
        }}
        >{displayName}</span>
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
