// Builds a keydown handler that stops the event and dispatches by lowercased key. Shared by the
// save/overwrite confirmation dialogs, whose only real difference is which keys map to which
// actions.
export function dialogKeyHandler(handlers: Record<string, () => void>): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handlers[e.key.toLowerCase()]?.();
  };
}
