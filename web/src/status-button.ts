import type { StatusWindowHandlers } from './useStatusWindows';

export function statusButton(
  hasContent: boolean,
  window: StatusWindowHandlers,
): { hasContent: boolean; onEnter: () => void; onLeave: () => void; onClick: () => void } {
  return {
    hasContent,
    onEnter: window.onButtonEnter,
    onLeave: window.onButtonLeave,
    onClick: window.onButtonClick,
  };
}
