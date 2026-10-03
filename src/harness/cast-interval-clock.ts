// The two halves of an asciicast v3 event stream's clock, in one place because the writer and its
// arithmetic have to agree: a v3 event carries the interval since the previous one rather than the
// absolute time since the start, so a writer that still thinks in absolute time has to subtract, and a
// long recording is exactly where getting that wrong is invisible until playback drifts.
//
// Rounding is where the format's own advice matters. Naively rounding each interval accumulates the
// error — a tenth of a millisecond lost per event is a second lost over ten thousand events — so the
// error is carried into the next interval instead of discarded, which is the error diffusion the
// v3 specification recommends and the reason a rounded stream still sums to the real elapsed time.
const MILLISECONDS = 1000;

export class IntervalClock {
  private previousMs = 0;
  private carried = 0;

  // The interval to write for an event that happened `elapsed` seconds after the recording started.
  interval(elapsed: number): number {
    const nowMs = elapsed * MILLISECONDS;
    const exact = nowMs - this.previousMs;
    const rounded = Math.round(exact + this.carried);
    this.carried = exact + this.carried - rounded;
    this.previousMs = nowMs;
    return rounded / MILLISECONDS;
  }
}
