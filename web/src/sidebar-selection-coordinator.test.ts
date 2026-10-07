import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from './ws';
import { SidebarSelectionCoordinator, sidebarSelectionFor } from './sidebar-selection-coordinator';

describe('SidebarSelectionCoordinator', () => {
  it('reports the selected entry of either sidebar', () => {
    const coordinator = new SidebarSelectionCoordinator();
    coordinator.publish('left', 'files');
    coordinator.publish('right', 'notes');
    expect(coordinator.isSelected('files')).toBe(true);
    expect(coordinator.isSelected('notes')).toBe(true);
    coordinator.publish('left', undefined);
    expect(coordinator.isSelected('files')).toBe(false);
  });

  it('routes a selection to the sidebar that owns the label until it unregisters', () => {
    const coordinator = new SidebarSelectionCoordinator();
    const left = vi.fn((label: string) => label === 'files');
    const right = vi.fn((label: string) => label === 'notes');
    const unregisterLeft = coordinator.register('left', left);
    coordinator.register('right', right);
    expect(coordinator.select('notes')).toBe(true);
    expect(coordinator.select('missing')).toBe(false);
    unregisterLeft();
    expect(coordinator.select('files')).toBe(false);
  });

  it('keeps one coordinator per client', () => {
    const first = {} as JanusClient;
    expect(sidebarSelectionFor(first)).toBe(sidebarSelectionFor(first));
    expect(sidebarSelectionFor({} as JanusClient)).not.toBe(sidebarSelectionFor(first));
  });
});
