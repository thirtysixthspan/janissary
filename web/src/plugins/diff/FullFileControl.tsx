import React, { useState } from 'react';

const FULL_FILE_CONTEXT = 1_000_000;

export function FullFileControl({ expanded, pending, error, toggle }: {
  expanded: boolean;
  pending: boolean;
  error?: string;
  toggle(fullFile: boolean): Promise<unknown>;
}) {
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState('');
  const request = async () => {
    setWaiting(true);
    setFailure('');
    try { await toggle(!expanded); }
    catch (error_) { setFailure(error_ instanceof Error ? error_.message : String(error_)); }
    finally { setWaiting(false); }
  };
  return (
    <div className="diff-full-file-control" onDoubleClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={pending || waiting}
        aria-busy={pending || waiting}
        onClick={() => { void request(); }}
      >
        {expanded ? 'Show condensed diff' : 'Show full file'}
      </button>
      {(error || failure) && <span role="alert">Context expansion failed: {error || failure}</span>}
    </div>
  );
}

export function isFullFileContext(lines: number | undefined): boolean {
  return lines === FULL_FILE_CONTEXT;
}
