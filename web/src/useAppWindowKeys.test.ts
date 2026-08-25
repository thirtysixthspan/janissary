import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useAppWindowKeys } from './useAppWindowKeys';
import type { StateSnapshot, Callbacks } from './useWindowKeys';
import type { JanusClient } from './ws';

vi.mock('./useWindowKeys', () => ({
  useWindowKeys: vi.fn(),
}));

import { useWindowKeys } from './useWindowKeys';

const mockedUseWindowKeys = useWindowKeys as ReturnType<typeof vi.fn>;

function fakeClient(): JanusClient {
  return { send: vi.fn() } as unknown as JanusClient;
}

function fakeDeps(pickerIdx: number): StateSnapshot & Callbacks {
  return { pickerOpen: true, pickerIdx } as unknown as StateSnapshot & Callbacks;
}

describe('useAppWindowKeys', () => {
  it('passes one and the same ref for both the state and the callbacks side', () => {
    mockedUseWindowKeys.mockClear();
    const deps = fakeDeps(0);
    renderHook(() => useAppWindowKeys(fakeClient(), () => false, () => {}, deps));

    const [, stateRef, callbacksRef] = mockedUseWindowKeys.mock.calls[0];
    expect(stateRef).toBe(callbacksRef);
    expect(stateRef.current).toBe(deps);
  });

  it('keeps the ref identity stable across a rerender while tracking the newest deps', () => {
    mockedUseWindowKeys.mockClear();
    const first = fakeDeps(0);
    const second = fakeDeps(3);
    const { rerender } = renderHook(
      ({ deps }) => useAppWindowKeys(fakeClient(), () => false, () => {}, deps),
      { initialProps: { deps: first } },
    );

    const stateRef = mockedUseWindowKeys.mock.calls[0][1];
    rerender({ deps: second });

    expect(mockedUseWindowKeys.mock.calls[1][1]).toBe(stateRef);
    expect(stateRef.current).toBe(second);
  });

  it('forwards the client and both scroll-key handlers unchanged', () => {
    mockedUseWindowKeys.mockClear();
    const client = fakeClient();
    const handleScrollKey = () => false;
    const handleScrollKeyUp = () => {};
    renderHook(() => useAppWindowKeys(client, handleScrollKey, handleScrollKeyUp, fakeDeps(0)));

    const call = mockedUseWindowKeys.mock.calls[0];
    expect(call[0]).toBe(client);
    expect(call[3]).toBe(handleScrollKey);
    expect(call[4]).toBe(handleScrollKeyUp);
  });
});
