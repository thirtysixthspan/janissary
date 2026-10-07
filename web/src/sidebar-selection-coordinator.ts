import type { JanusClient } from './ws';

type Side = 'left' | 'right';

export class SidebarSelectionCoordinator {
  private selected = new Map<Side, string>();
  private selectors = new Map<Side, (label: string) => boolean>();

  publish(side: Side, label: string | undefined): void {
    if (label === undefined) this.selected.delete(side);
    else this.selected.set(side, label);
  }

  register(side: Side, select: (label: string) => boolean): () => void {
    this.selectors.set(side, select);
    return () => {
      if (this.selectors.get(side) === select) this.selectors.delete(side);
    };
  }

  isSelected(label: string): boolean {
    return [...this.selected.values()].includes(label);
  }

  select(label: string): boolean {
    return [...this.selectors.values()].some((select) => select(label));
  }
}

const coordinators = new WeakMap<JanusClient, SidebarSelectionCoordinator>();

export function sidebarSelectionFor(client: JanusClient): SidebarSelectionCoordinator {
  let coordinator = coordinators.get(client);
  if (!coordinator) {
    coordinator = new SidebarSelectionCoordinator();
    coordinators.set(client, coordinator);
  }
  return coordinator;
}
