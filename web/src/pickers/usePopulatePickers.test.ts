import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileRow, TaskRow } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import type { CommandInputDropHandle } from '../shared/drop-handles';
import type { PopulatePickersOptions } from './usePopulatePickers';
import { usePopulatePickers } from './usePopulatePickers';

const mocks = vi.hoisted(() => ({
  taskPicker: vi.fn(),
  profilePicker: vi.fn(),
}));

vi.mock('./useTaskPicker', () => ({ useTaskPicker: mocks.taskPicker }));
vi.mock('./useProfilePicker', () => ({ useProfilePicker: mocks.profilePicker }));

const tasks: TaskRow[] = [];
const profiles: ProfileRow[] = [];
const client = { send: vi.fn(), request: vi.fn() } as unknown as JanusClient;
const dropRef = { current: null } as React.RefObject<CommandInputDropHandle | null>;
const focusHarness = vi.fn();
const pluginCommandLineInsertions = { current: new Map() };
const pluginCommandLineReplacements = { current: new Map() };

function options(): PopulatePickersOptions {
  return {
    tasks, profiles, client, harnessPtyId: undefined, dropRef, focusHarness,
    pluginCommandLineInsertions, profileOwnerLabel: undefined,
    profileHarnessPtyId: undefined, profileReplacements: pluginCommandLineReplacements,
    shellLabel: undefined,
  };
}

type Merged = ReturnType<typeof usePopulatePickers>;

function renderHook(opts: PopulatePickersOptions): Merged {
  let hook: Merged | undefined;
  function Test() {
    hook = usePopulatePickers(opts);
    return null;
  }
  render(React.createElement(Test));
  return hook!;
}

let taskHandlers: { openTaskPicker: () => void; pickTask: () => void; shared: string };
let profileHandlers: { openProfilePicker: () => void; pickProfile: () => void; shared: string };

describe('usePopulatePickers', () => {
  beforeEach(() => {
    mocks.taskPicker.mockReset();
    mocks.profilePicker.mockReset();
    taskHandlers = { openTaskPicker: vi.fn(), pickTask: vi.fn(), shared: 'from-task' };
    profileHandlers = { openProfilePicker: vi.fn(), pickProfile: vi.fn(), shared: 'from-profile' };
    mocks.taskPicker.mockReturnValue(taskHandlers);
    mocks.profilePicker.mockReturnValue(profileHandlers);
  });

  it('forwards each named option to the delegates in their positional order', () => {
    const opts = options();
    renderHook(opts);
    expect(mocks.taskPicker).toHaveBeenCalledExactlyOnceWith(
      opts.tasks, opts.client, opts.harnessPtyId, opts.dropRef,
      opts.focusHarness, opts.pluginCommandLineInsertions, opts.shellLabel,
    );
    expect(mocks.profilePicker).toHaveBeenCalledExactlyOnceWith(
      opts.profiles, opts.profileOwnerLabel, opts.profileReplacements,
      opts.client, opts.profileHarnessPtyId,
    );
  });

  it('keeps both delegates\' handlers in the merged result', () => {
    const merged = renderHook(options());
    expect(merged.openTaskPicker).toBe(taskHandlers.openTaskPicker);
    expect(merged.pickTask).toBe(taskHandlers.pickTask);
    expect(merged.openProfilePicker).toBe(profileHandlers.openProfilePicker);
    expect(merged.pickProfile).toBe(profileHandlers.pickProfile);
  });

  it('lets the profile half win on a key both delegates return', () => {
    const merged = renderHook(options());
    expect((merged as unknown as Record<string, unknown>).shared).toBe('from-profile');
  });
});
