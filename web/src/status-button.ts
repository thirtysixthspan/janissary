import type { StatusWindowHandlers } from './useStatusWindows';

export type StatusWindowButtonProps = { hasContent: boolean; onEnter: () => void; onLeave: () => void; onClick: () => void };

export function statusButton(
  hasContent: boolean,
  window: StatusWindowHandlers,
): StatusWindowButtonProps {
  return {
    hasContent,
    onEnter: window.onButtonEnter,
    onLeave: window.onButtonLeave,
    onClick: window.onButtonClick,
  };
}
