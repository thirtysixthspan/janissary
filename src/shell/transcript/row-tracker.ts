import type { IMarker, Terminal } from '@xterm/headless';

// Decides which of a headless terminal's normal-screen rows have been finished and hands each one
// to `sink` exactly once, in order, as one string per flush (each row followed by `\n`).
//
// One xterm marker sits on the next row to write. Its `line` follows that row through scrolling,
// scrollback trimming and reflow, and it only ever moves forward: a line feed flushes every row from
// the marker up to (not including) the cursor's row, then re-registers it on the cursor's row. A line
// feed with the cursor at or above the marker — a multi-line redraw moving back over rows already
// written — writes nothing, so a row redrawn later keeps its first-written form.
//
// The marker is disposed when its row is trimmed out of the scrollback, erased (`ED 0` below the
// cursor, `ED 2` as part of `clear` or a zle redraw), or wiped by a full reset (the reset hook below).
// The writer then resumes by writing only the row the line feed just finished. Accepted consequences:
// rows that auto-wrapped between the erase and the first line feed after it lose all but their last
// row, and when an `ED 0` erases rows below a row already written, that row is written a second time
// in its current form.
//
// Nothing is written while the alternate buffer is active; the normal buffer's marker stays put.
export class TranscriptRowTracker {
  private marker: IMarker | undefined;

  constructor(private readonly term: Terminal, private readonly sink: (text: string) => void) {
    this.marker = term.registerMarker(0);
    term.onLineFeed(() => { this.onLineFeed(); });
    // A full reset (`RIS`) leaves the marker at its old index over a wiped buffer, which would skip
    // the first rows after it; drop the marker and let xterm's own reset run (`false`).
    term.parser.registerEscHandler({ final: 'c' }, () => {
      this.dropMarker();
      return false;
    });
  }

  // The final flush on exit or disposal: the cursor's unfinished row is written as-is.
  finish(): void {
    if (this.isAlternate()) return;
    const cursor = this.cursorRow();
    const marker = this.liveMarker();
    if (marker === undefined) this.writeRows(cursor, cursor);
    else if (marker.line <= cursor) this.writeRows(marker.line, cursor);
  }

  // xterm fires this after the cursor has moved, so the row just finished is the one above it.
  private onLineFeed(): void {
    if (this.isAlternate()) return;
    const cursor = this.cursorRow();
    const marker = this.liveMarker();
    if (marker === undefined) this.writeRows(cursor - 1, cursor - 1);
    else if (marker.line <= cursor - 1) this.writeRows(marker.line, cursor - 1);
    else return;
    this.dropMarker();
    this.marker = this.term.registerMarker(0);
  }

  private liveMarker(): IMarker | undefined {
    if (this.marker === undefined || this.marker.isDisposed || this.marker.line < 0) return undefined;
    return this.marker;
  }

  private dropMarker(): void {
    this.marker?.dispose();
    this.marker = undefined;
  }

  private isAlternate(): boolean {
    return this.term.buffer.active.type === 'alternate';
  }

  private cursorRow(): number {
    const buffer = this.term.buffer.active;
    return buffer.baseY + buffer.cursorY;
  }

  private writeRows(first: number, last: number): void {
    if (first < 0 || last < first) return;
    const buffer = this.term.buffer.active;
    let text = '';
    for (let i = first; i <= last; i++) text += (buffer.getLine(i)?.translateToString(true) ?? '') + '\n';
    this.sink(text);
  }
}
