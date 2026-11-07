import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import type { DirtyTabHandle } from '../shared/tab/handles';
import { CloseSaveGuard } from './CloseSaveGuard';
import { walkTitle } from './save-walk';

function tab(label: string, overrides: Partial<TabView> = {}): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 0, groupColor: '#000', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    ...overrides,
  };
}

function makeHandle(save: () => Promise<void> = () => Promise.resolve(), dirty = true) {
  return { isDirty: () => dirty, save: vi.fn(save), focus: vi.fn() };
}

function deferred() {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the client targets ES2023
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type SetupOptions = {
  revealDocked?: (label: string) => boolean;
  wrapper?: (element: React.ReactElement) => React.ReactElement;
};

function setup(
  initialTabs: TabView[],
  handles: Map<string, DirtyTabHandle>,
  options: SetupOptions = {},
) {
  const tabHandles: React.RefObject<Map<string, DirtyTabHandle>> = { current: handles };
  const guardRef = React.createRef<((index: number) => boolean) | null>();
  const quitWalkRef = { current: null as (() => boolean) | null };
  const saveWalkOpenRef = { current: false };
  const client = { send: vi.fn() };
  const onQuit = vi.fn();
  const revealDocked = vi.fn(options.revealDocked ?? (() => false));
  const wrap = options.wrapper ?? ((element: React.ReactElement) => element);
  const element = (nextTabs: TabView[]) => (
    <CloseSaveGuard
      tabs={nextTabs}
      tabHandles={tabHandles}
      client={client as never}
      guardRef={guardRef}
      quitWalkRef={quitWalkRef}
      saveWalkOpenRef={saveWalkOpenRef}
      onQuit={onQuit}
      revealDocked={revealDocked}
    />
  );
  const view = render(wrap(element(initialTabs)));
  const setTabs = (nextTabs: TabView[]) => { view.rerender(wrap(element(nextTabs))); };
  return {
    ...view, client, onQuit, revealDocked, quitWalkRef, saveWalkOpenRef, guardRef, tabHandles, setTabs,
  };
}

function startWalk(ref: { current: (() => boolean) | null }): boolean {
  let started: boolean | undefined;
  act(() => { started = ref.current!(); });
  return started!;
}

function focusTabCalls(client: { send: ReturnType<typeof vi.fn> }) {
  return client.send.mock.calls
    .map(([message]) => message)
    .filter((message) => message.method === 'focusTab')
    .map((message) => message.params.label);
}

describe('CloseSaveGuard quit walk', () => {
  it('asks about dirty tabs in tab-list order, one at a time', () => {
    const alpha = makeHandle();
    const beta = makeHandle();
    const h = setup([tab('alpha'), tab('beta')], new Map([['alpha', alpha], ['beta', beta]]));

    expect(startWalk(h.quitWalkRef)).toBe(true);
    expect(h.getByText(walkTitle('alpha'))).toBeInTheDocument();
    expect(h.queryByText(walkTitle('beta'))).toBeNull();

    fireEvent.click(h.getByText("Don't Save (n)"));

    expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();
    expect(h.queryByText(walkTitle('alpha'))).toBeNull();
  });

  it('reveals each tab with focusTab before its dialog and never closes a tab', () => {
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', makeHandle()], ['beta', makeHandle()]]),
    );

    startWalk(h.quitWalkRef);
    expect(focusTabCalls(h.client)).toEqual(['alpha']);

    fireEvent.click(h.getByText("Don't Save (n)"));
    expect(focusTabCalls(h.client)).toEqual(['alpha', 'beta']);

    fireEvent.click(h.getByText("Don't Save (n)"));
    expect(h.onQuit).toHaveBeenCalledOnce();
    expect(h.client.send.mock.calls.map(([message]) => message.method)).not.toContain('closeTab');
  });

  it('lets a sidebar accept a label instead of sending focusTab for it', () => {
    const revealDocked = (label: string) => label === 'docked';
    const h = setup(
      [tab('docked', { dock: 'left' }), tab('center')],
      new Map([['docked', makeHandle()], ['center', makeHandle()]]),
      { revealDocked },
    );

    startWalk(h.quitWalkRef);
    expect(h.revealDocked).toHaveBeenCalledWith('docked');
    expect(h.client.send).not.toHaveBeenCalled();
    expect(h.getByText(walkTitle('docked'))).toBeInTheDocument();

    fireEvent.click(h.getByText("Don't Save (n)"));

    expect(h.revealDocked).toHaveBeenCalledWith('center');
    expect(h.client.send).toHaveBeenCalledExactlyOnceWith({ method: 'focusTab', params: { label: 'center' } });
    expect(h.getByText(walkTitle('center'))).toBeInTheDocument();
  });

  it('titles each dialog with the tab full name: editor, title, then label', () => {
    const editorTab = tab('editor-tab', {
      editor: { name: 'notes.md', path: '/repo/notes.md', size: '1 B', url: '/open/1' },
    });
    const titleTab = tab('title-tab', { title: 'Readme' });
    const labelTab = tab('label-tab');
    const h = setup(
      [editorTab, titleTab, labelTab],
      new Map([
        ['editor-tab', makeHandle()],
        ['title-tab', makeHandle()],
        ['label-tab', makeHandle()],
      ]),
    );

    startWalk(h.quitWalkRef);
    expect(h.getByText(walkTitle('notes.md'))).toBeInTheDocument();

    fireEvent.click(h.getByText("Don't Save (n)"));
    expect(h.getByText(walkTitle('Readme'))).toBeInTheDocument();

    fireEvent.click(h.getByText("Don't Save (n)"));
    expect(h.getByText(walkTitle('label-tab'))).toBeInTheDocument();
  });

  it('falls back to the label when the current tab disappears before it is answered', () => {
    const h = setup([tab('alpha', { title: 'Readme' })], new Map([['alpha', makeHandle()]]));

    startWalk(h.quitWalkRef);
    expect(h.getByText(walkTitle('Readme'))).toBeInTheDocument();

    h.setTabs([]);

    expect(h.getByText(walkTitle('alpha'))).toBeInTheDocument();
    expect(h.queryByText(walkTitle('Readme'))).toBeNull();
    expect(h.queryByRole('alertdialog')).toBeInTheDocument();
  });

  it('marks walk dialogs with the save-walk-dialog class and close dialogs without it', () => {
    const h = setup([tab('alpha')], new Map([['alpha', makeHandle()]]));

    startWalk(h.quitWalkRef);
    expect(h.getByRole('alertdialog')).toHaveClass('save-walk-dialog');

    fireEvent.click(h.getByText('Cancel (Esc)'));
    act(() => { h.guardRef.current!(0); });
    expect(h.getByRole('alertdialog')).not.toHaveClass('save-walk-dialog');
  });

  it('focuses each step dialog when it mounts', () => {
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', makeHandle()], ['beta', makeHandle()]]),
    );

    startWalk(h.quitWalkRef);
    const first = h.getByRole('alertdialog');
    expect(first).toHaveFocus();

    fireEvent.click(h.getByText("Don't Save (n)"));

    const second = h.getByRole('alertdialog');
    expect(second).not.toBe(first);
    expect(second).toHaveFocus();
  });

  it('waits for each save in turn and quits exactly once after the last one resolves', async () => {
    const alpha = makeHandle();
    const beta = makeHandle();
    const lastSave = deferred();
    const gamma = makeHandle(() => lastSave.promise);
    const h = setup(
      [tab('alpha'), tab('beta'), tab('gamma')],
      new Map([['alpha', alpha], ['beta', beta], ['gamma', gamma]]),
    );

    startWalk(h.quitWalkRef);
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    expect(alpha.save).toHaveBeenCalledOnce();
    expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();

    fireEvent.click(h.getByText("Don't Save (n)"));
    expect(beta.save).not.toHaveBeenCalled();
    expect(h.getByText(walkTitle('gamma'))).toBeInTheDocument();

    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    expect(gamma.save).toHaveBeenCalledOnce();
    expect(h.onQuit).not.toHaveBeenCalled();
    expect(h.saveWalkOpenRef.current).toBe(true);

    await act(async () => { lastSave.resolve(); });

    expect(h.onQuit).toHaveBeenCalledOnce();
    expect(h.queryByRole('alertdialog')).toBeNull();
    expect(h.saveWalkOpenRef.current).toBe(false);
  });

  it("advances on Don't Save without saving or closing the tab", () => {
    const alpha = makeHandle();
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', alpha], ['beta', makeHandle()]]),
    );

    startWalk(h.quitWalkRef);
    fireEvent.click(h.getByText("Don't Save (n)"));

    expect(alpha.save).not.toHaveBeenCalled();
    expect(alpha.focus).not.toHaveBeenCalled();
    expect(h.client.send.mock.calls.map(([message]) => message.method)).not.toContain('closeTab');
    expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();
  });

  it('stops the whole walk on Cancel, focuses the second tab, and clears the walk flag', () => {
    const alpha = makeHandle();
    const beta = makeHandle();
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', alpha], ['beta', beta]]),
    );

    startWalk(h.quitWalkRef);
    fireEvent.click(h.getByText("Don't Save (n)"));
    fireEvent.click(h.getByText('Cancel (Esc)'));

    expect(alpha.save).not.toHaveBeenCalled();
    expect(beta.save).not.toHaveBeenCalled();
    expect(h.onQuit).not.toHaveBeenCalled();
    expect(beta.focus).toHaveBeenCalledOnce();
    expect(alpha.focus).not.toHaveBeenCalled();
    expect(h.saveWalkOpenRef.current).toBe(false);
    expect(h.queryByRole('alertdialog')).toBeNull();
  });

  it('stops the walk, dismisses, and focuses the tab when a save rejects', async () => {
    const alpha = makeHandle(() => Promise.reject(new Error('write failed')));
    const h = setup([tab('alpha')], new Map([['alpha', alpha]]));

    startWalk(h.quitWalkRef);
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });

    expect(h.onQuit).not.toHaveBeenCalled();
    expect(h.queryByRole('alertdialog')).toBeNull();
    expect(alpha.focus).toHaveBeenCalledOnce();
    expect(h.saveWalkOpenRef.current).toBe(false);
  });

  it.each(['resolve', 'reject'])('ignores a save that %s after Cancel', async (outcome) => {
    const pending = deferred();
    const alpha = makeHandle(() => pending.promise);
    const h = setup([tab('alpha')], new Map([['alpha', alpha]]));

    startWalk(h.quitWalkRef);
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    fireEvent.click(h.getByText('Cancel (Esc)'));
    expect(alpha.focus).toHaveBeenCalledOnce();

    await act(async () => {
      if (outcome === 'resolve') pending.resolve();
      else pending.reject(new Error('late failure'));
    });

    expect(alpha.focus).toHaveBeenCalledOnce();
    expect(h.onQuit).not.toHaveBeenCalled();
    expect(h.queryByRole('alertdialog')).toBeNull();
  });

  it('submits only one save across repeated clicks and keys while pending', async () => {
    const pending = deferred();
    const alpha = makeHandle(() => pending.promise);
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', alpha], ['beta', makeHandle()]]),
    );

    startWalk(h.quitWalkRef);
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    fireEvent.keyDown(document, { key: 'y' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(alpha.save).toHaveBeenCalledOnce();
    expect(h.getByText('Save (y)')).toBeDisabled();

    await act(async () => { pending.resolve(); });

    expect(alpha.save).toHaveBeenCalledOnce();
    expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();
  });

  it.each(['resolve', 'reject'])(
    "advances on Don't Save while a save is pending and ignores the later %s",
    async (outcome) => {
      const pending = deferred();
      const alpha = makeHandle(() => pending.promise);
      const beta = makeHandle();
      const h = setup(
        [tab('alpha'), tab('beta')],
        new Map([['alpha', alpha], ['beta', beta]]),
      );

      startWalk(h.quitWalkRef);
      await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
      fireEvent.click(h.getByText("Don't Save (n)"));
      expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();

      await act(async () => {
        if (outcome === 'resolve') pending.resolve();
        else pending.reject(new Error('late failure'));
      });

      expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();
      expect(alpha.focus).not.toHaveBeenCalled();
      expect(h.onQuit).not.toHaveBeenCalled();
      expect(h.saveWalkOpenRef.current).toBe(true);
    },
  );

  it.each(['Save (y)', "Don't Save (n)", 'Cancel (Esc)'])(
    'skips a tab removed before %s is pressed and opens the next one',
    async (button) => {
      const alpha = makeHandle();
      const h = setup(
        [tab('alpha'), tab('beta')],
        new Map([['alpha', alpha], ['beta', makeHandle()]]),
      );

      startWalk(h.quitWalkRef);
      h.setTabs([tab('beta')]);
      await act(async () => { fireEvent.click(h.getByText(button)); });

      expect(alpha.save).not.toHaveBeenCalled();
      expect(alpha.focus).not.toHaveBeenCalled();
      expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();
    },
  );

  it('quits when a tab removed before a button press was the last dirty one', () => {
    const h = setup([tab('alpha')], new Map([['alpha', makeHandle()]]));

    startWalk(h.quitWalkRef);
    h.setTabs([]);
    fireEvent.click(h.getByText("Don't Save (n)"));

    expect(h.onQuit).toHaveBeenCalledOnce();
    expect(h.saveWalkOpenRef.current).toBe(false);
    expect(h.queryByRole('alertdialog')).toBeNull();
  });

  it.each(['Save (y)', "Don't Save (n)", 'Cancel (Esc)'])(
    'skips a tab whose handle is removed before %s is pressed',
    async (button) => {
      const alpha = makeHandle();
      const h = setup(
        [tab('alpha'), tab('beta')],
        new Map([['alpha', alpha], ['beta', makeHandle()]]),
      );

      startWalk(h.quitWalkRef);
      h.tabHandles.current.delete('alpha');
      await act(async () => { fireEvent.click(h.getByText(button)); });

      expect(alpha.save).not.toHaveBeenCalled();
      expect(alpha.focus).not.toHaveBeenCalled();
      expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();
    },
  );

  it('skips a tab that was already gone before its turn', () => {
    const beta = makeHandle();
    const h = setup(
      [tab('alpha'), tab('beta'), tab('gamma')],
      new Map([['alpha', makeHandle()], ['beta', beta], ['gamma', makeHandle()]]),
    );

    startWalk(h.quitWalkRef);
    h.setTabs([tab('alpha'), tab('gamma')]);
    fireEvent.click(h.getByText("Don't Save (n)"));

    expect(h.getByText(walkTitle('gamma'))).toBeInTheDocument();
    expect(beta.save).not.toHaveBeenCalled();
    expect(beta.focus).not.toHaveBeenCalled();
    expect(focusTabCalls(h.client)).toEqual(['alpha', 'gamma']);
  });

  it('carries the selected choice into the next step and still honours shortcut keys', async () => {
    const alpha = makeHandle();
    const beta = makeHandle();
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', alpha], ['beta', beta]]),
    );

    startWalk(h.quitWalkRef);
    expect(h.getByText('Save (y)')).toHaveClass('selected');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(h.getByText("Don't Save (n)")).toHaveClass('selected');

    await act(async () => { fireEvent.keyDown(document, { key: 'y' }); });
    expect(alpha.save).toHaveBeenCalledOnce();
    expect(h.getByText("Don't Save (n)")).toHaveClass('selected');

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(beta.save).not.toHaveBeenCalled();
    expect(h.onQuit).toHaveBeenCalledOnce();
  });

  it('leaves an open walk untouched when it is started again', async () => {
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', makeHandle()], ['beta', makeHandle()]]),
    );

    startWalk(h.quitWalkRef);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(startWalk(h.quitWalkRef)).toBe(true);

    expect(h.getByText(walkTitle('alpha'))).toBeInTheDocument();
    expect(h.getByText("Don't Save (n)")).toHaveClass('selected');
    expect(focusTabCalls(h.client)).toEqual(['alpha']);
    expect(h.saveWalkOpenRef.current).toBe(true);

    await act(async () => { fireEvent.keyDown(document, { key: 'Enter' }); });
    expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();
    await act(async () => { fireEvent.keyDown(document, { key: 'Enter' }); });

    expect(h.onQuit).toHaveBeenCalledOnce();
  });

  it('starts over at the first dirty tab with Save selected after Cancel', async () => {
    const alpha = makeHandle();
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', alpha], ['beta', makeHandle()]]),
    );

    startWalk(h.quitWalkRef);
    fireEvent.click(h.getByText("Don't Save (n)"));
    fireEvent.click(h.getByText('Cancel (Esc)'));

    expect(startWalk(h.quitWalkRef)).toBe(true);
    expect(h.getByText(walkTitle('alpha'))).toBeInTheDocument();
    expect(h.getByText('Save (y)')).toHaveClass('selected');
    expect(h.saveWalkOpenRef.current).toBe(true);

    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    expect(alpha.save).toHaveBeenCalledOnce();
    expect(h.getByText(walkTitle('beta'))).toBeInTheDocument();
  });

  it('refuses to start a walk while a close request is open', () => {
    const h = setup([tab('alpha')], new Map([['alpha', makeHandle()]]));

    act(() => { h.guardRef.current!(0); });
    expect(h.getByText('Do you want to save changes to this file?')).toBeInTheDocument();

    expect(startWalk(h.quitWalkRef)).toBe(true);

    expect(h.getByText('Do you want to save changes to this file?')).toBeInTheDocument();
    expect(h.queryByText(walkTitle('alpha'))).toBeNull();
    expect(h.client.send).not.toHaveBeenCalled();
    expect(h.saveWalkOpenRef.current).toBe(false);
  });

  it.each(['resolve', 'reject'])(
    'lets a close request replace a walk and ignores the pending walk save (%s)',
    async (outcome) => {
      const pending = deferred();
      const alpha = makeHandle(() => pending.promise);
      const beta = makeHandle();
      const h = setup(
        [tab('alpha'), tab('beta')],
        new Map([['alpha', alpha], ['beta', beta]]),
      );

      startWalk(h.quitWalkRef);
      await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
      act(() => { h.guardRef.current!(1); });

      expect(h.saveWalkOpenRef.current).toBe(false);
      expect(h.getByText('Do you want to save changes to this file?')).toBeInTheDocument();

      await act(async () => {
        if (outcome === 'resolve') pending.resolve();
        else pending.reject(new Error('late failure'));
      });

      expect(h.onQuit).not.toHaveBeenCalled();
      expect(alpha.focus).not.toHaveBeenCalled();
      expect(beta.focus).not.toHaveBeenCalled();
      expect(h.getByText('Do you want to save changes to this file?')).toBeInTheDocument();
    },
  );

  it('keeps the walk flag true across an advance and while a save is pending', async () => {
    const pending = deferred();
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', makeHandle(() => pending.promise)], ['beta', makeHandle()]]),
    );

    expect(h.saveWalkOpenRef.current).toBe(false);

    startWalk(h.quitWalkRef);
    expect(h.saveWalkOpenRef.current).toBe(true);

    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    expect(h.saveWalkOpenRef.current).toBe(true);

    fireEvent.click(h.getByText("Don't Save (n)"));
    expect(h.saveWalkOpenRef.current).toBe(true);

    fireEvent.click(h.getByText('Cancel (Esc)'));
    expect(h.saveWalkOpenRef.current).toBe(false);
  });

  it('returns false and opens nothing when no tab is dirty', () => {
    const h = setup([tab('alpha')], new Map([['alpha', makeHandle(undefined, false)]]));

    expect(startWalk(h.quitWalkRef)).toBe(false);
    expect(h.queryByRole('alertdialog')).toBeNull();
    expect(h.client.send).not.toHaveBeenCalled();
    expect(h.saveWalkOpenRef.current).toBe(false);
  });

  it.each(['resolve', 'reject'])('ignores a save that %s after unmount', async (outcome) => {
    const pending = deferred();
    const alpha = makeHandle(() => pending.promise);
    const h = setup([tab('alpha')], new Map([['alpha', alpha]]));

    startWalk(h.quitWalkRef);
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    h.unmount();

    expect(h.quitWalkRef.current).toBeNull();

    await act(async () => {
      if (outcome === 'resolve') pending.resolve();
      else pending.reject(new Error('late failure'));
    });

    expect(h.onQuit).not.toHaveBeenCalled();
    expect(alpha.focus).not.toHaveBeenCalled();
  });

  it('sends one focusTab per label and quits once under StrictMode', async () => {
    const h = setup(
      [tab('alpha'), tab('beta')],
      new Map([['alpha', makeHandle()], ['beta', makeHandle()]]),
      { wrapper: (element) => <React.StrictMode>{element}</React.StrictMode> },
    );

    startWalk(h.quitWalkRef);
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });

    expect(focusTabCalls(h.client)).toEqual(['alpha', 'beta']);
    expect(h.onQuit).toHaveBeenCalledOnce();
    expect(h.saveWalkOpenRef.current).toBe(false);
  });
});
