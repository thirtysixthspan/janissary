// The empty run-out below an editor buffer's last line, which is what lets a find preview scroll a
// match near the end of the file to the quarter mark instead of leaving it behind the overlay. A
// browser clamps `scrollTop` to the end of the content, so the room has to exist before the offset
// is set. Its height lives only in its inline style, written here, so neither helper needs a layout
// read of the run-out itself.

function runoutHeight(runout: HTMLElement): number {
  return Number(runout.style.height.replace('px', '')) || 0;
}

function setRunoutHeight(runout: HTMLElement, height: number): void {
  runout.style.height = height > 0 ? `${height}px` : '';
}

// Grow the run-out by however far `scrollTop` lies past the largest offset the body allows now.
export function extendRunout(body: HTMLElement, runout: HTMLElement, scrollTop: number): void {
  const deficit = scrollTop - (body.scrollHeight - body.clientHeight);
  if (deficit > 0) setRunoutHeight(runout, runoutHeight(runout) + Math.ceil(deficit));
}

// Shrink the run-out to the part the view still reaches into, and never grow it: closing the find
// overlay leaves the view where it is, and scrolling back up gives the room back. A hidden tab's
// body reports no height and a zero offset, which would discard the room its restored offset needs.
export function trimRunout(body: HTMLElement, runout: HTMLElement): void {
  const height = runoutHeight(runout);
  if (height === 0 || body.clientHeight === 0) return;
  const content = body.scrollHeight - height;
  const reached = Math.max(0, Math.ceil(body.scrollTop + body.clientHeight - content));
  if (reached < height) setRunoutHeight(runout, reached);
}
