import React, { useState } from 'react';
import type {
  VisualizationTable,
  VisualizationWindow,
} from '@shared/plugins/visualizations/shared';
import { ConfirmDialog } from '../api';
import { ChartSvg } from './chart/ChartSvg';
import { VisualizationChat } from './VisualizationChat';
import { VisualizationQuestion } from './VisualizationQuestion';

// Everything below the metadata row. Which of the four things it shows is decided entirely by the
// record, and each one is the answer to a different question: is anything wrong, is there a question
// waiting, is the source still being read, or is there a chart. They are exclusive because showing two
// of them would answer none.

export type BodyProperties = {
  view: VisualizationWindow;
  busy: boolean;
  active: boolean;
  onAnswer(questionId: string, answer: string): void;
  onAskAgain(): void;
  onRevise(query: string): void;
  onCancel(): void;
  onSetSource(source: string): void;
  chartRef: React.RefObject<SVGSVGElement | null>;
};

export function VisualizationBody(props: BodyProperties): React.ReactElement {
  const { view } = props;
  if (view.deleted === true) return <p className="visualization-gone">This visualization was deleted.</p>;
  if (view.error !== undefined) return <Reason {...props} reason={view.error} />;
  if (view.pendingQuestionId !== undefined) return <Question {...props} />;
  if (view.table === undefined) return <p className="visualization-pending">Reading the source…</p>;
  if (view.chart === undefined) return <Nothing {...props} />;
  return <Drawn {...props} />;
}

function Reason({ view, busy, reason, onAskAgain, onSetSource }: BodyProperties & { reason: string }): React.ReactElement {
  return (
    <div className="visualization-reason">
      <p className="visualization-reason-text">{reason}</p>
      <div className="visualization-reason-actions">
        <SourceButton busy={busy} onSetSource={onSetSource} />
        {view.table === undefined ? null : (
          <button type="button" disabled={busy} onClick={onAskAgain}>Ask again</button>
        )}
      </div>
    </div>
  );
}

function Question({ view, busy, onAnswer }: BodyProperties): React.ReactElement {
  const question = view.questions.find((entry) => entry.id === view.pendingQuestionId);
  if (!question) return <p className="visualization-pending">Reading the source…</p>;
  return (
    <VisualizationQuestion
      question={question}
      index={view.questions.findIndex((entry) => entry.id === question.id)}
      total={view.questions.length}
      busy={busy}
      disabled={false}
      onAnswer={(answer) => { onAnswer(question.id, answer); }}
    />
  );
}

// A source read and a model consulted, and still nothing to draw. The two controls are the only two
// things that can change that, so they are the only things on screen.
function Nothing({ view, busy, onAskAgain, onSetSource }: BodyProperties): React.ReactElement {
  return (
    <div className="visualization-reason">
      <p className="visualization-reason-text">
        {view.questions.length === 0
          ? 'The model had no questions to ask.'
          : 'No chart yet. Answering the last question produces one.'}
      </p>
      <div className="visualization-reason-actions">
        <button type="button" disabled={busy} onClick={onAskAgain}>Ask again</button>
        <SourceButton busy={busy} onSetSource={onSetSource} />
      </div>
    </div>
  );
}

// Changing the source discards the interview and every answer in it, so it is confirmed before the
// field appears rather than done on a first click. This is only reachable before a chart exists: the
// host refuses the change afterwards, and a control that could only ever be refused is not one worth
// showing.
function SourceButton({ busy, onSetSource }: { busy: boolean; onSetSource(source: string): void }): React.ReactElement {
  const [step, setStep] = useState<'ask' | 'confirm' | 'edit'>('ask');
  const [text, setText] = useState('');
  if (step === 'confirm') {
    return (
      <ConfirmDialog
        title="Change the source? The questions asked so far are discarded."
        confirmLabel="Change source"
        onCancel={() => { setStep('ask'); }}
        onConfirm={() => { setStep('edit'); }}
      />
    );
  }
  if (step === 'ask') {
    return (
      <button type="button" disabled={busy} onClick={() => { setStep('confirm'); }}>
        Change the source
      </button>
    );
  }
  return (
    <form
      className="visualization-source-form"
      onSubmit={(event) => {
        event.preventDefault();
        setStep('ask');
        onSetSource(text);
      }}
    >
      <input
        type="text"
        value={text}
        placeholder="https://example.com/data.csv"
        aria-label="Data source"
        onChange={(event) => { setText(event.target.value); }}
        onKeyDown={(event) => { if (event.key === 'Escape') setStep('ask'); }}
      />
      <button type="submit" disabled={text.trim() === ''}>Use this source</button>
    </form>
  );
}

function caption(table: VisualizationTable, readAt: number | undefined): string {
  const rows = table.truncated ? `showing ${table.rows.length} of ${table.total} rows` : `${table.rows.length} rows`;
  return readAt === undefined ? rows : `${rows} · read ${new Date(readAt).toLocaleTimeString()}`;
}

function Drawn(props: BodyProperties): React.ReactElement {
  const { view, busy, active, chartRef, onRevise, onCancel } = props;
  const table = view.table;
  const chart = view.chart;
  if (!table || !chart) return <p className="visualization-pending">Reading the source…</p>;
  return (
    <>
      <figure className="visualization-figure">
        <ChartSvg ref={chartRef} chart={chart} table={table} />
        <figcaption>{caption(table, view.readAt)}</figcaption>
      </figure>
      <VisualizationChat
        turns={view.turns}
        busy={busy}
        disabled={false}
        active={active}
        onRevise={onRevise}
        onCancel={onCancel}
      />
    </>
  );
}
