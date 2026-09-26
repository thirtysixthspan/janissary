type Action = { type: 'toggle' | 'open' | 'edit' | 'reroot'; path: string } | undefined;

type Handlers = {
  reroot: (path: string) => void;
  toggle: (path: string) => void;
  open: (path: string) => void;
  edit: (path: string) => void;
};

export function runFileNavigatorAction(action: Action, handlers: Handlers): void {
  if (!action) return;
  switch (action.type) {
    case 'reroot': { handlers.reroot(action.path); break; }
    case 'toggle': { handlers.toggle(action.path); break; }
    case 'open': { handlers.open(action.path); break; }
    case 'edit': { handlers.edit(action.path); break; }
  }
}
