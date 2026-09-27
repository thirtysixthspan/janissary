import React, { useState } from 'react';
import type {
  VisualizationChart,
  VisualizationTable,
  VisualizationWindow,
} from '@shared/plugins/visualizations/shared';
import { ConfirmDialog } from '../api';
import { bandsOf, DEFAULT_VIEW, viewedMarksFor, type ChartView } from './chart/view';
import { ChartControls } from './ChartControls';
import { ChartSvg } from './chart/ChartSvg';
import { VisualizationChat } from './VisualizationChat';
import { VisualizationData } from './VisualizationData';
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
  if (view.pendingQuestionId !== undefined) return <Question {...props} />;
  if (view.table === undefined) {
    return view.error === undefined
      ? <p className="visualization-pending">Reading the source…</p>
      : <Reason {...props} reason={view.error} />;
  }
  if (view.chart === undefined) return <Nothing {...props} reason={view.error} />;
  // A failure that follows data the tab already has is a note above the chart, not a replacement for
  // it: the marks are still true of the table they were drawn from, and taking them away would cost the
  // user the chart at exactly the moment a flaky endpoint makes it worth having.
  return <Drawn {...props} reason={view.error} />;
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
function Nothing({
  view, busy, onAskAgain, onSetSource, reason,
}: BodyProperties & { reason?: string }): React.ReactElement {
  const idle = view.questions.length === 0
    ? 'The model had no questions to ask.'
    : 'No chart yet. Answering the last question produces one.';
  return (
    <div className="visualization-reason">
      {reason === undefined ? null : <p className="visualization-reason-text">{reason}</p>}
      <p className="visualization-reason-text">{idle}</p>
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

// The line under the chart says how much of the source it is showing, how the measure was reduced, and —
// when the chart is not the whole story — exactly what has been left out. A bar whose height is a sum
// reads as a raw value to anyone not told otherwise, and a chart showing five of twelve regions with
// nothing saying so is a chart lying by omission.
function caption(
  table: VisualizationTable,
  chart: VisualizationChart,
  readAt: number | undefined,
  shown: ChartView,
  bands: number,
): string {
  const rows = table.truncated ? `showing ${table.rows.length} of ${table.total} rows` : `${table.rows.length} rows`;
  const how = chart.aggregate === undefined ? '' : ` · ${chart.aggregate} of ${chart.y}`;
  const capped = shown.limit > 0 && shown.limit < bands ? ` · top ${shown.limit} of ${bands}` : '';
  const only = shown.focus === undefined ? '' : ` · only ${shown.focus}`;
  const when = readAt === undefined ? '' : ` · read ${new Date(readAt).toLocaleTimeString()}`;
  return `${rows}${how}${capped}${only}${when}`;
}

function Drawn(props: BodyProperties & { reason?: string }): React.ReactElement {
  const { view, busy, active, chartRef, onRevise, onCancel, reason } = props;
  const table = view.table;
  const chart = view.chart;
  // The window is `view`; how the marks are being looked at is `shown`, because the two are unrelated
  // and one shadowing the other is how a caption ends up describing the wrong thing.
  const [shown, setShown] = React.useState<ChartView>(DEFAULT_VIEW);
  // A re-read replaces the table a view was narrowing, so the view goes with it rather than silently
  // carrying over onto data the user never saw. `readAt` is the one field that moves when new data
  // arrives, and it is absent until a read has succeeded.
  React.useEffect(() => { setShown(DEFAULT_VIEW); }, [view.readAt]);
  if (!table || !chart) return <p className="visualization-pending">Reading the source…</p>;
  // Every category, not the narrowed ones: a filter that could only offer what it had already kept
  // would be a filter nobody could widen again.
  const labels = bandsOf(viewedMarksFor(table, chart, DEFAULT_VIEW).points);
  return (
    <>
      {reason === undefined ? null : <p className="visualization-reason-note">{reason}</p>}
      <figure className="visualization-figure">
        <ChartSvg ref={chartRef} chart={chart} table={table} view={shown} />
        <figcaption>{caption(table, chart, view.readAt, shown, labels.length)}</figcaption>
      </figure>
      <ChartControls view={shown} labels={labels} onChange={setShown} />
      <VisualizationData chart={chart} table={table} view={shown} />
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
