import React from 'react';
import type { LineReview } from './useLineComment';

export function LineCommentPanel({ review }: { review: LineReview }) {
  if (!review.draft && !review.note) return null;
  return (
    <div className="diff-line-comment" onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <div className="diff-comment-anchor">{review.label}</div>
      {review.draft ? (
        <form onSubmit={(event) => { event.preventDefault(); review.save(); }} onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); review.cancel(); }
        }}>
          <p className="diff-comment-lifetime">Comments are temporary and are not sent anywhere.</p>
          <textarea
            autoFocus
            aria-label={`Comment on ${review.label}`}
            value={review.draft.body}
            onChange={(event) => review.edit(event.target.value)}
          />
          <button type="submit" disabled={!review.draft.body.trim()}>Save comment</button>
          <button type="button" onClick={review.cancel}>Cancel</button>
        </form>
      ) : review.note && (
        <div>
          {review.changed && <div className="diff-comment-changed">Line changed since this comment: <code>{review.note.source}</code></div>}
          <p>{review.note.body}</p>
          <button type="button" aria-label={`Edit saved comment on ${review.label}`} onClick={review.start}>Edit comment</button>
          <button type="button" aria-label={`Delete comment on ${review.label}`} onClick={review.remove}>Delete comment</button>
        </div>
      )}
    </div>
  );
}
