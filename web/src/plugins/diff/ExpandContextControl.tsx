import React, { useState } from 'react';

export function ExpandContextControl({ pending, error, expand }: {
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
    <div className="diff-context-control" onDoubleClick={(event) => event.stopPropagation()}>
      <button type="button" disabled={pending || waiting} aria-busy={pending || waiting} onClick={() => { void request(); }}>Show more context</button>
      {(error || failure) && <span role="alert">Context expansion failed: {error || failure}</span>}
    </div>
  );
}
