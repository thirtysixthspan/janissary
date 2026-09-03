import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import { TabStrip } from './TabStrip';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'tab1',
    number: 1,
    dotColor: '#fff',
    group: 0,
    groupColor: '#000',
    busy: false,
    hasUnread: false,
    cwd: '/tmp',
    connections: [],
    schedule: [],
    bufferLines: [],
    cmdHistory: [], commandQueue: [],
    toolStepsExpanded: false,
    ...overrides,
  };
}

function StatefulTabStrip({ tabs, initialActiveTab = 0 }: { tabs: TabView[]; initialActiveTab?: number }) {
  const [activeTab, setActiveTab] = React.useState(initialActiveTab);
  return (
    <TabStrip
      tabs={tabs}
      activeTab={activeTab}
      onSelect={setActiveTab}
      onClose={vi.fn()}
      onRename={vi.fn()}
      tabNameMaxLength={100}
    />
  );
}

function mockTabRects(container: HTMLElement): void {
  for (const [index, tab] of [...container.querySelectorAll<HTMLElement>('.tab')].entries()) {
    vi.spyOn(tab, 'getBoundingClientRect').mockReturnValue({
      x: index * 100,
      y: 0,
      left: index * 100,
      top: 0,
      right: index * 100 + 80,
      bottom: 30,
      width: 80,
      height: 30,
      toJSON: vi.fn(),
    });
  }
}

describe('TabStrip', () => {
  it('renders a tab label', () => {
    const tab = makeTab({ label: 'mytab' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    expect(screen.getByText('mytab')).toBeInTheDocument();
  });

  it('renders title instead of label when title is set', () => {
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    expect(screen.getByText('Display Name')).toBeInTheDocument();
  });

  it('marks the active tab with the active class', () => {
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    const { container } = render(
      <TabStrip tabs={tabs} activeTab={1} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    const tabEls = container.querySelectorAll('.tab');
    expect(tabEls[0]).not.toHaveClass('active');
    expect(tabEls[1]).toHaveClass('active');
  });

  it('calls onSelect with the tab index when clicked', async () => {
    const onSelect = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(<TabStrip tabs={tabs} activeTab={0} onSelect={onSelect} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByText('b'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('shows a close button for harness tabs and renders the harness name', () => {
    const tab = makeTab({ label: 'claude', view: 'harness', title: 'claude' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /close/i })).toHaveLength(1);
  });

  it('shows a close button for page tabs and renders the title', () => {
    const tab = makeTab({ label: 'page', view: 'plugin', title: 'slashdot.org' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    expect(screen.getByText('slashdot.org')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /close/i })).toHaveLength(1);
  });

  it('calls onClose and stops propagation when the close button is clicked', async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const tab = makeTab({ label: 'img', view: 'plugin' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={onSelect} onClose={onClose} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledWith(0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies busy class to the dot when tab is busy', () => {
    const tab = makeTab({ busy: true });
    const { container } = render(
      <TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    expect(container.querySelector('.dot.busy')).toBeInTheDocument();
  });

  it('shows the unread badge when hasUnread is set', () => {
    const { container, getByRole } = render(
      <TabStrip tabs={[makeTab({ hasUnread: true })]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    const badge = getByRole('img', { name: 'unread' });
    expect(badge).toHaveClass('tab-badge');
    expect(badge.querySelector('svg[data-icon="flag"]')).not.toBeNull();
    expect(container.querySelector('.tab-badge')).toBeInTheDocument();
  });

  it('shows no badge when hasUnread is false', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab({ hasUnread: false })]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    expect(container.querySelector('.tab-badge')).not.toBeInTheDocument();
  });

  it('single-clicking an active tab label does not start renaming', async () => {
    const onSelect = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={onSelect} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByText('Display Name'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('double-clicking the active tab label shows an input pre-filled with the current display name', async () => {
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.dblClick(screen.getByText('Display Name'));
    expect(screen.getByDisplayValue('Display Name')).toBeInTheDocument();
  });

  it('double-clicking an editor tab label shows an input pre-filled with the full, untruncated file name', async () => {
    const tab = makeTab({
      label: 'internal',
      view: 'editor',
      title: 'a-very-long-fi',
      editor: { name: 'a-very-long-file-name.md', path: '/tmp/a-very-long-file-name.md', size: '1 KB', url: '/open/1' },
    });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={14} />);
    await userEvent.dblClick(screen.getByText('a-very-long-file-name.md'));
    expect(screen.getByDisplayValue('a-very-long-file-name.md')).toBeInTheDocument();
  });

  it('clicking an inactive tab label still selects it instead of editing', async () => {
    const onSelect = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(<TabStrip tabs={tabs} activeTab={0} onSelect={onSelect} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByText('b'));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('double-clicking an inactive tab label selects it but does not start renaming', async () => {
    const onSelect = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(<TabStrip tabs={tabs} activeTab={0} onSelect={onSelect} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.dblClick(screen.getByText('b'));
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('double-clicking a tab that starts inactive selects it but does not start renaming, even when onSelect updates the active tab', async () => {
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    const { container } = render(<StatefulTabStrip tabs={tabs} />);
    await userEvent.dblClick(screen.getByText('b'));
    const tabEls = container.querySelectorAll('.tab');
    expect(tabEls[1]).toHaveClass('active');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('double-clicking a tab that is already active still starts renaming', async () => {
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(<StatefulTabStrip tabs={tabs} initialActiveTab={1} />);
    await userEvent.dblClick(screen.getByText('b'));
    expect(screen.getByDisplayValue('b')).toBeInTheDocument();
  });

  it('commits the trimmed value once on Enter', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={100} />);
    await userEvent.dblClick(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '  reviewer  {Enter}');
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(0, '  reviewer  ');
  });

  it('truncates typed input to the 50-character rename cap regardless of tabNameMaxLength', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={4} />);
    await userEvent.dblClick(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'a'.repeat(60) + '{Enter}');
    expect(onRename).toHaveBeenCalledWith(0, 'a'.repeat(50));
  });

  it('grows the rename input as the draft grows instead of reserving fixed space', async () => {
    const tab = makeTab({ label: 'internal', title: 'ab' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.dblClick(screen.getByText('ab'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.size).toBe(2);
    await userEvent.type(input, 'cdef');
    expect(input.size).toBe(6);
  });

  it('cancels without committing on Escape', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={100} />);
    await userEvent.dblClick(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'x{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Display Name')).toBeInTheDocument();
  });

  it('returns focus to the editor with the pre-rename label on commit', async () => {
    const onFocusEditor = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(
      <TabStrip
        tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()}
        tabNameMaxLength={100} onFocusEditor={onFocusEditor}
      />,
    );
    await userEvent.dblClick(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{Enter}');
    expect(onFocusEditor).toHaveBeenCalledTimes(1);
    expect(onFocusEditor).toHaveBeenCalledWith('internal');
  });

  it('does not call onFocusEditor on cancel', async () => {
    const onFocusEditor = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(
      <TabStrip
        tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()}
        tabNameMaxLength={100} onFocusEditor={onFocusEditor}
      />,
    );
    await userEvent.dblClick(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'x{Escape}');
    expect(onFocusEditor).not.toHaveBeenCalled();
  });

  it('commits without an onFocusEditor prop without throwing', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={100} />);
    await userEvent.dblClick(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await expect(userEvent.type(input, '{Enter}')).resolves.not.toThrow();
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('calls onFocusCommandBar on mousedown of a tab label', () => {
    const onFocusCommandBar = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(
      <TabStrip
        tabs={tabs}
        activeTab={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onRename={vi.fn()}
        tabNameMaxLength={100}
        onFocusCommandBar={onFocusCommandBar}
      />,
    );
    fireEvent.mouseDown(screen.getByText('b'));
    expect(onFocusCommandBar).toHaveBeenCalledTimes(1);
  });

  it('dims the tab border when the window is unfocused', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab()]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} windowFocused={false} />,
    );
    const tabEl = container.querySelector('.tab') as HTMLElement;
    expect(tabEl.style.borderTopColor).toContain('color-mix');
  });

  it('shows the full-strength tab border when the window is focused', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab({ groupColor: '#123456' })]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} windowFocused />,
    );
    const tabEl = container.querySelector('.tab') as HTMLElement;
    expect(tabEl.style.borderTopColor).not.toContain('color-mix');
  });

  it('shows the full-strength tab border when windowFocused is omitted', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab()]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    const tabEl = container.querySelector('.tab') as HTMLElement;
    expect(tabEl.style.borderTopColor).not.toContain('color-mix');
  });

  it('does not crash on mousedown of a tab label when onFocusCommandBar is omitted', () => {
    const onSelect = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(<TabStrip tabs={tabs} activeTab={0} onSelect={onSelect} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    fireEvent.mouseDown(screen.getByText('b'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('selects without reordering when the mouse does not move', () => {
    const onSelect = vi.fn();
    const onReorder = vi.fn();
    render(
      <TabStrip
        tabs={[makeTab({ label: 'a' }), makeTab({ label: 'b' })]}
        activeTab={0} onSelect={onSelect} onClose={vi.fn()} onRename={vi.fn()}
        onReorder={onReorder} tabNameMaxLength={100}
      />,
    );
    fireEvent.mouseDown(screen.getByText('b'), { clientX: 140 });
    fireEvent.mouseUp(document, { clientX: 140 });
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('reorders once after movement passes the drag threshold', () => {
    const onReorder = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' }), makeTab({ label: 'c' })];
    const { container } = render(
      <TabStrip tabs={tabs} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()}
        onRename={vi.fn()} onReorder={onReorder} tabNameMaxLength={100} />,
    );
    mockTabRects(container);
    fireEvent.mouseDown(screen.getByText('a'), { clientX: 40 });
    fireEvent.mouseMove(document, { clientX: 240 });
    fireEvent.mouseUp(document);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it('cancels a drag on Escape and restores the original positions', () => {
    const onReorder = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' }), makeTab({ label: 'c' })];
    const { container } = render(
      <TabStrip tabs={tabs} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()}
        onRename={vi.fn()} onReorder={onReorder} tabNameMaxLength={100} />,
    );
    mockTabRects(container);
    fireEvent.mouseDown(screen.getByText('a'), { clientX: 40 });
    fireEvent.mouseMove(document, { clientX: 240 });
    expect((container.querySelector('.tab') as HTMLElement).style.transform).not.toBe('');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect((container.querySelector('.tab') as HTMLElement).style.transform).toBe('');
    fireEvent.mouseUp(document);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('commits the last previewed slot when released outside the strip', () => {
    const onReorder = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' }), makeTab({ label: 'c' })];
    const { container } = render(
      <TabStrip tabs={tabs} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()}
        onRename={vi.fn()} onReorder={onReorder} tabNameMaxLength={100} />,
    );
    mockTabRects(container);
    fireEvent.mouseDown(screen.getByText('a'), { clientX: 40 });
    fireEvent.mouseMove(document, { clientX: 140 });
    fireEvent.mouseUp(document.body, { clientX: 1000 });
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it('moves a dragged tab to another strip in the same drop zone', () => {
    const onReorder = vi.fn();
    const onCrossStripDrop = vi.fn();
    const crossStripDrop = { zone: 'center', onDrop: onCrossStripDrop };
    const { container } = render(<>
      <TabStrip
        tabs={[makeTab({ label: 'source' })]} activeTab={0} onSelect={vi.fn()}
        onClose={vi.fn()} onRename={vi.fn()} onReorder={onReorder}
        crossStripDrop={crossStripDrop} tabNameMaxLength={100}
      />
      <TabStrip
        tabs={[makeTab({ label: 'target' })]} activeTab={0} onSelect={vi.fn()}
        onClose={vi.fn()} onRename={vi.fn()}
        crossStripDrop={{ zone: 'center', onDrop: vi.fn() }} tabNameMaxLength={100}
      />
    </>);
    mockTabRects(container);
    fireEvent.mouseDown(screen.getByText('source'), { clientX: 40 });
    fireEvent.mouseMove(document, { clientX: 140 });
    fireEvent.mouseUp(screen.getByText('target'));
    expect(onCrossStripDrop).toHaveBeenCalledOnce();
    expect(onCrossStripDrop).toHaveBeenCalledWith(0);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not move a dragged tab to a strip in another drop zone', () => {
    const onReorder = vi.fn();
    const onCrossStripDrop = vi.fn();
    const { container } = render(<>
      <TabStrip
        tabs={[makeTab({ label: 'source' }), makeTab({ label: 'source-two' })]}
        activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()}
        onReorder={onReorder}
        crossStripDrop={{ zone: 'center', onDrop: onCrossStripDrop }} tabNameMaxLength={100}
      />
      <TabStrip
        tabs={[makeTab({ label: 'target' })]} activeTab={0} onSelect={vi.fn()}
        onClose={vi.fn()} onRename={vi.fn()}
        crossStripDrop={{ zone: 'sidebar', onDrop: vi.fn() }} tabNameMaxLength={100}
      />
    </>);
    mockTabRects(container);
    fireEvent.mouseDown(screen.getByText('source'), { clientX: 40 });
    fireEvent.mouseMove(document, { clientX: 140 });
    fireEvent.mouseUp(screen.getByText('target'));
    expect(onCrossStripDrop).not.toHaveBeenCalled();
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it('clamps a drag to the dragged tab group', () => {
    const onReorder = vi.fn();
    const tabs = [
      makeTab({ label: 'a', group: 1 }),
      makeTab({ label: 'b', group: 1 }),
      makeTab({ label: 'c', group: 2 }),
    ];
    const { container } = render(
      <TabStrip tabs={tabs} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()}
        onRename={vi.fn()} onReorder={onReorder} tabNameMaxLength={100} />,
    );
    mockTabRects(container);
    fireEvent.mouseDown(screen.getByText('a'), { clientX: 40 });
    fireEvent.mouseMove(document, { clientX: 240 });
    fireEvent.mouseUp(document);
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it('still renames after a press with no drag movement', async () => {
    const onReorder = vi.fn();
    render(
      <TabStrip tabs={[makeTab({ label: 'a' })]} activeTab={0} onSelect={vi.fn()}
        onClose={vi.fn()} onRename={vi.fn()} onReorder={onReorder} tabNameMaxLength={100} />,
    );
    await userEvent.dblClick(screen.getByText('a'));
    expect(screen.getByDisplayValue('a')).toBeInTheDocument();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('commits on blur', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(
      <>
        <TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={100} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.dblClick(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'reviewer');
    await userEvent.click(screen.getByText('elsewhere'));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(0, 'Display Namereviewer');
  });
  it('truncates an inactive tab to the configured short limit with an ellipsis', () => {
    const tabs = [makeTab({ label: 'active' }), makeTab({ label: 'inactive', title: 'abcdefgh' })];
    render(
      <TabStrip
        tabs={tabs} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()}
        tabNameMaxLength={5} activeTabNameMaxLength={20}
      />,
    );
    expect(screen.getByText('abcd…')).toBeInTheDocument();
  });

  it('expands the active tab to the configured focused limit', () => {
    const tab = makeTab({ label: 'internal', title: 'abcdefgh' });
    render(
      <TabStrip
        tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()}
        tabNameMaxLength={5} activeTabNameMaxLength={10}
      />,
    );
    expect(screen.getByText('abcdefgh')).toBeInTheDocument();
  });

  it('ellipsizes the active tab when its name exceeds the configured focused limit', () => {
    const tab = makeTab({ label: 'internal', title: 'abcdefgh' });
    render(
      <TabStrip
        tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()}
        tabNameMaxLength={3} activeTabNameMaxLength={5}
      />,
    );
    expect(screen.getByText('abcd…')).toBeInTheDocument();
  });
});
