// One harness tab's window onto the session record its harness binary is writing to its own dot
// directory. A source is constructed with the tab's cwd and the moment its PTY spawned, and answers
// exactly one question: what text has appeared since I last asked?
//
// Resolution state (which file or database row this tab's session is) and read position (a byte
// offset, or a row key) stay private to each implementation, so no cursor ever crosses this seam —
// the tailer above carries only the rendered strings.
export type TranscriptSource = {
  // Rendered blocks produced since the previous call: empty while no session has resolved yet, when
  // nothing new has been written, or when the underlying read failed (a transient lock, a schema
  // this version does not recognize). Never throws.
  poll: () => string[];

  // Whether this source has located its tab's session record. The tailer watches this to decide
  // when to give up and fall back to screen snapshots alone.
  resolved: () => boolean;
};
