type ScrollTarget = {
  rows: number;
  scrollLines: (amount: number) => void;
  scrollToBottom: () => void;
};

export function createShellScrollKeyHandlers(target: ScrollTarget) {
  let acceleration: { started: number; direction: -1 | 1 } | null = null;

  const keydown = (event: KeyboardEvent): boolean => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      target.scrollLines((event.key === 'PageUp' ? -1 : 1) * Math.max(1, Math.floor(target.rows / 2)));
      return true;
    }
    if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      target.scrollToBottom();
      return true;
    }
    const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : null;
    if (direction === null || !(event.shiftKey || event.ctrlKey)) return false;
    event.preventDefault();
    if (!acceleration || acceleration.direction !== direction) {
      acceleration = { started: Date.now(), direction };
    }
    const elapsed = Date.now() - acceleration.started;
    const lines = Math.min(10, Math.max(1, Math.round(2 ** (elapsed / 1000))));
    target.scrollLines(direction * lines);
    return true;
  };

  const keyup = (event: KeyboardEvent) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') acceleration = null;
  };

  return { keydown, keyup };
}
