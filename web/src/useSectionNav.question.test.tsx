import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { PendingQuestionView, TabView } from '@shared/protocol';
import { QuestionPanel } from './QuestionPanel';
import { useSectionNav } from './useSectionNav';
import type { JanusClient } from './ws';

// The section-nav chord is registered app-wide in the capture phase, so a question panel rendered on
// its own never meets it. These cases mount both, the way App does, to pin who gets Shift+Tab.

function makeTab(): TabView {
  return {
    label: 'build', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: true, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    view: 'agent',
  };
}

function Harness({ question, focusCenter }: { question: PendingQuestionView; focusCenter: () => void }) {
  useSectionNav([makeTab()], focusCenter);
  return (
    <div className="app-center">
      <textarea aria-label="Command line" />
      <QuestionPanel question={question} client={{ send: vi.fn() } as unknown as JanusClient} />
    </div>
  );
}

const approve: PendingQuestionView = {
  id: 'question-1', tab: 'build', kind: 'approve', question: 'Ship it?', options: ['yes', 'no'],
};

const ask: PendingQuestionView = { id: 'question-2', tab: 'build', kind: 'ask', question: 'Your name?' };

function inPanel(): boolean {
  return screen.getByRole('dialog').contains(document.activeElement);
}

describe('Shift+Tab in a pending question panel', () => {
  it('moves from Cancel to the last option instead of cycling sections', async () => {
    const user = userEvent.setup();
    const focusCenter = vi.fn();
    render(<Harness question={approve} focusCenter={focusCenter} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(screen.getByRole('button', { name: 'no' })).toHaveFocus();
    expect(inPanel()).toBe(true);
    expect(focusCenter).not.toHaveBeenCalled();
  });

  it('wraps from the first option back to Cancel', async () => {
    const user = userEvent.setup();
    const focusCenter = vi.fn();
    render(<Harness question={approve} focusCenter={focusCenter} />);

    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'yes' })).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(focusCenter).not.toHaveBeenCalled();
  });

  it('moves from Cancel to Submit in a free-text panel', async () => {
    const user = userEvent.setup();
    const focusCenter = vi.fn();
    render(<Harness question={ask} focusCenter={focusCenter} />);
    screen.getByRole('button', { name: 'Cancel' }).focus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus();
    expect(focusCenter).not.toHaveBeenCalled();
  });

  it('moves from the Answer field to Cancel, staying inside the panel', async () => {
    const user = userEvent.setup();
    const focusCenter = vi.fn();
    render(<Harness question={ask} focusCenter={focusCenter} />);
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(inPanel()).toBe(true);
    expect(focusCenter).not.toHaveBeenCalled();
  });

  it('still cycles sections from the command line while a panel is pending', async () => {
    const user = userEvent.setup();
    const focusCenter = vi.fn();
    render(<Harness question={approve} focusCenter={focusCenter} />);
    screen.getByRole('textbox', { name: 'Command line' }).focus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(focusCenter).toHaveBeenCalledTimes(1);
  });
});
