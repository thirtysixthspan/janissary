import React, { useState } from 'react';

const LABELS = { top: 'Show lines above changes', between: 'Show lines between changes', bottom: 'Show lines below changes' } as const;

export function ExpandBoundaryControl({ position, pending, error, expand }: {
  position: keyof typeof LABELS;
  pending: boolean;
  error?: string;
  expand(): Promise<unknown>;
}) {
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState('');
  const request = async () => {
    setWaiting(true);
    setFailure('');
    try { await expand(); }
    catch (error_) { setFailure(error_ instanceof Error ? error_.message : String(error_)); }
    finally { setWaiting(false); }
  };
  return (
    <div className={`diff-context-boundary diff-context-boundary-${position}`} onDoubleClick={(event) => event.stopPropagation()}>
      <button type="button" disabled={pending || waiting} aria-busy={pending || waiting} onClick={() => { void request(); }}>
        {LABELS[position]}
      </button>
      {(error || failure) && <span role="alert">Context expansion failed: {error || failure}</span>}
    </div>
  );
}
