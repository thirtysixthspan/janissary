import React, { useEffect, useRef, useState } from 'react';

export type ContextMenuItem = { label: string; onActivate: () => void };

// The menu's own geometry, used to keep it inside the window. Measuring the rendered element would
// need a second render pass to place it; the rows are a fixed height, so the size is known up front.
const ITEM_HEIGHT_PX = 22;
const SEPARATOR_HEIGHT_PX = 9;
const MENU_WIDTH_PX = 180;
const EDGE_MARGIN_PX = 4;

// Anchor the menu at the pointer, shifted back inside the viewport when it would overflow the right
// or bottom edge. Exported for the placement tests, which have no layout engine to measure with.
export function contextMenuPosition(
  x: number, y: number, groups: ContextMenuItem[][], viewport: { width: number; height: number },
): { left: number; top: number } {
  const items = groups.reduce((count, group) => count + group.length, 0);
  const height = items * ITEM_HEIGHT_PX + Math.max(groups.length - 1, 0) * SEPARATOR_HEIGHT_PX;
  return {
    left: Math.max(EDGE_MARGIN_PX, Math.min(x, viewport.width - MENU_WIDTH_PX - EDGE_MARGIN_PX)),
    top: Math.max(EDGE_MARGIN_PX, Math.min(y, viewport.height - height - EDGE_MARGIN_PX)),
  };
}

type Properties = {
  groups: ContextMenuItem[][];
  x: number;
  y: number;
  onClose: () => void;
};

// A positioned menu of labelled actions, drawn in the picker's visual language with a separator
// between groups. It knows nothing about what its items do, so any surface can raise one: the
// caller supplies the groups and decides which entries exist at all (an unavailable action is
// omitted, never greyed out). Keyboard navigation, highlighting, and the blur-to-dismiss behavior
// mirror the opener picker's, so the two read and respond the same way.
export function ContextMenu({ groups, x, y, onClose }: Properties) {
  const items = groups.flat();
  const [selected, setSelected] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { containerRef.current?.focus(); }, []);

  const activate = (index: number) => {
    items[index]?.onActivate();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    switch (e.key) {
    case 'ArrowUp': { e.preventDefault(); setSelected(Math.max(0, selected - 1)); break; }
    case 'ArrowDown': { e.preventDefault(); setSelected(Math.min(items.length - 1, selected + 1)); break; }
    case 'Enter': { e.preventDefault(); activate(selected); break; }
    case 'Escape': { e.preventDefault(); onClose(); break; }
    }
  };

  return (
    <div
      ref={containerRef}
      className="picker context-menu"
      role="menu"
      tabIndex={-1}
      style={contextMenuPosition(x, y, groups, { width: window.innerWidth, height: window.innerHeight })}
      onKeyDown={onKeyDown}
      onBlur={onClose}
    >
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group[0]?.label ?? groupIndex}>
          {groupIndex > 0 && <div className="context-menu-separator" />}
          {group.map((item) => (
            <div
              key={item.label}
              role="menuitem"
              className={`picker-row${items.indexOf(item) === selected ? ' selected' : ''}`}
              // Without this the row's own mousedown blurs the menu, which closes it before the
              // click that would have activated the item ever lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activate(items.indexOf(item))}
            >
              {item.label}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
