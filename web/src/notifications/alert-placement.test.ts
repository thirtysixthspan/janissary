import { describe, expect, it, vi } from 'vitest';
import type { StateEvent, TabView } from '@shared/protocol';
import { createAlertPlacement, type DockedAlertSelection } from './alert-placement';

function stateWith(tabs: Array<Partial<TabView>>, activeTab = 0): StateEvent {
  return { tabs, activeTab } as unknown as StateEvent;
}

function dockedSelection(selected: string | undefined): DockedAlertSelection & { select: ReturnType<typeof vi.fn> } {
  return { isSelected: (label) => label === selected, select: vi.fn(() => true) };
}

describe('createAlertPlacement', () => {
  it('treats a docked tab as visible only while it is the selected sidebar entry', () => {
    const state = stateWith([{ label: 'janus' }, { label: 'files', dock: 'right' }]);
    expect(createAlertPlacement(() => state, dockedSelection('files')).isVisible('files')).toBe(true);
    expect(createAlertPlacement(() => state, dockedSelection('notes')).isVisible('files')).toBe(false);
    expect(createAlertPlacement(() => state, undefined).isVisible('files')).toBe(false);
  });

  it('treats a centre tab as visible only while it is the active tab', () => {
    const state = stateWith([{ label: 'janus' }, { label: 'build' }], 1);
    const placement = createAlertPlacement(() => state, dockedSelection('build'));
    expect(placement.isVisible('build')).toBe(true);
    expect(placement.isVisible('janus')).toBe(false);
  });

  it('reveals a docked tab through sidebar selection and declines a centre tab', () => {
    const docked = dockedSelection(undefined);
    const state = stateWith([{ label: 'janus' }, { label: 'files', dock: 'left' }]);
    const placement = createAlertPlacement(() => state, docked);
    expect(placement.reveal('janus')).toBe(false);
    expect(docked.select).not.toHaveBeenCalled();
    expect(placement.reveal('files')).toBe(true);
    expect(docked.select).toHaveBeenCalledWith('files');
  });

  it('reads placement at click time so an undocked tab falls back to the centre path', () => {
    const docked = dockedSelection(undefined);
    let state = stateWith([{ label: 'files', dock: 'right' }]);
    const placement = createAlertPlacement(() => state, docked);
    state = stateWith([{ label: 'files' }]);
    expect(placement.reveal('files')).toBe(false);
    expect(docked.select).not.toHaveBeenCalled();
  });
});
