import { describe, expect, it, vi } from 'vitest';
import {
  dispatchProfilePickerKey, handleProfilePickerKey, profilePickerRows,
} from './profile-picker-keys';

const profiles = [
  { name: 'coding', source: 'project' as const },
  { name: 'writing', source: 'project' as const },
  { name: 'planning', source: 'janissary' as const },
];

describe('profile picker keys', () => {
  it('adds a header for each present source', () => {
    expect(profilePickerRows(profiles)).toEqual([
      { name: 'Project', source: 'project', header: true },
      profiles[0],
      profiles[1],
      { name: 'Janissary', source: 'janissary', header: true },
      profiles[2],
    ]);
  });

  it('moves between profiles while skipping headers', () => {
    const rows = profilePickerRows(profiles);
    expect(handleProfilePickerKey(rows, 2, 'ArrowDown').index).toBe(4);
    expect(handleProfilePickerKey(rows, 4, 'ArrowUp').index).toBe(2);
  });

  it('picks profiles and closes on Escape', () => {
    const rows = profilePickerRows(profiles);
    expect(handleProfilePickerKey(rows, 1, 'Enter').action).toEqual({ type: 'pick', name: 'coding' });
    expect(handleProfilePickerKey(rows, 1, 'Escape').action).toEqual({ type: 'close' });
  });

  it('re-seats a selection past the end onto the last profile without picking', () => {
    const rows = profilePickerRows(profiles);
    expect(handleProfilePickerKey(rows, 8, 'Enter')).toEqual({ index: 4 });
  });

  it('re-seats a selection on a header onto the profile below it without picking', () => {
    const rows = profilePickerRows(profiles);
    expect(handleProfilePickerKey(rows, 3, 'Enter')).toEqual({ index: 4 });
  });

  it('closes on Escape from a header row or an empty list', () => {
    const rows = profilePickerRows(profiles);
    expect(handleProfilePickerKey(rows, 0, 'Escape')).toEqual({ index: 1, action: { type: 'close' } });
    expect(handleProfilePickerKey([], 2, 'Escape')).toEqual({ index: 0, action: { type: 'close' } });
  });

  it('dispatches a selected profile name', () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    const pickProfile = vi.fn();
    dispatchProfilePickerKey(event, profilePickerRows(profiles), 4, vi.fn(), pickProfile, vi.fn());
    expect(pickProfile).toHaveBeenCalledWith('planning');
  });
});
