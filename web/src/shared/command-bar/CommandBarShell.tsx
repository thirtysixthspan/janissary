import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { statusDotIcon, promptIcon } from '../icons';
import { useCommandBarInset } from './useCommandBarInset';
import { useCommandBarDrop } from './useCommandBarDrop';

export type CommandBarShellProperties = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  // The completed text the ghost overlay trails behind what has been typed, or undefined for none.
  // Computed by `useCommandBarKeys`, which also owns accepting it.
  ghost?: string;
  // A row above the command line — the agent bar's completion strip. A slot rather than a prop of
  // its own so this component never learns what a completion is.
  above?: ReactNode;
  // Rendered at the end of the command line and pinned to its right, for controls that act on the
  // line rather than supply its text. A slot rather than a prop of its own, for the same reason as
  // `above`: this component lays the line out and never learns what a control is.
  trailing?: ReactNode;
  // Rendered just before the prompt glyph. The agent bar puts `queue` here while commands are
  // waiting; an input with nothing to announce passes nothing.
  label?: ReactNode;
  rootRef?: React.RefObject<HTMLDivElement | null>;
  dotColor?: string;
  busy?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  // Publishes this bar as a file-navigator drop target in its own right. The agent tab's bar leaves
  // it off: it already answers drops through the application's `dropRef`.
  acceptsFileDrops?: boolean;
};

// The command bar's chrome and the one behavior inseparable from it. Presentational otherwise:
// every key is handled by whatever `onKeyDown` the owner passes, which for both of today's callers
// is built from `useCommandBarKeys`.
export function CommandBarShell({
  value, onChange, onKeyDown, inputRef, ghost, above, trailing, label, rootRef,
  dotColor = 'var(--accent)', busy = false, autoFocus = false, disabled = false, ariaLabel, onFocus, onBlur,
  acceptsFileDrops = false,
}: CommandBarShellProperties) {
  const ownRoot = useRef<HTMLDivElement>(null);
  const root = rootRef ?? ownRoot;
  useCommandBarInset(root);
  useCommandBarDrop(root, inputRef, value, acceptsFileDrops);

  // Auto-resize: shrink to one row first so `scrollHeight` reflects the actual content, then
  // grow to fit. Runs after every value change (typing, paste, history recall, ghost accept,
  // Shift+Enter newline, submit-clear).
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = '0';
    element.style.height = `${element.scrollHeight}px`;
  }, [value, inputRef]);

  return (
    <div className="command-area" data-doc-shot="command-bar" data-command-bar ref={root}>
      {above}
      <div className="command" onClick={() => inputRef.current?.focus()}>
        <span className={`dot${busy ? ' busy' : ''}`} style={{ color: dotColor }}><FontAwesomeIcon icon={statusDotIcon} /></span>
        <span>{label !== undefined && <>{label} </>}<FontAwesomeIcon icon={promptIcon} /></span>
        <div className="input-wrap">
          {ghost && (
            <span className="ghost" aria-hidden="true">
              <span className="ghost-typed">{value}</span>{ghost.slice(value.length)}
            </span>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            aria-label={ariaLabel}
            autoFocus={autoFocus}
            disabled={disabled}
            spellCheck={false}
            onChange={(event) => { onChange(event.target.value); }}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>
        {trailing !== undefined && <span className="command-trailing">{trailing}</span>}
      </div>
    </div>
  );
}
