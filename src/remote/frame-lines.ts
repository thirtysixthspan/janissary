// Newline-delimited framing, shared by both ends of the protocol: a frame is one line, and the
// transport reads arrive in whatever sizes the pipe hands over, so one line — or several — can be
// split across two reads. Everything up to the last newline is a complete line; the tail after it
// is held back and returned for the next read to finish.
//
// `keepGoing` is consulted after every line, whether or not the line held a frame, and returning
// false stops the drain. The local channel leaves the framing states part-way through a buffer — a
// `shutdown` frame ends the session, and the bytes behind it are terminal output, not frames — so
// what is left is handed back to it rather than dispatched. The remote end never stops early.

export function drainFrames(
  buffer: string,
  dispatch: (line: string) => void,
  keepGoing: () => boolean = () => true,
): string {
  let rest = buffer;
  let newline = rest.indexOf('\n');
  while (newline !== -1) {
    const line = rest.slice(0, newline).trim();
    rest = rest.slice(newline + 1);
    if (line) dispatch(line);
    if (!keepGoing()) return rest;
    newline = rest.indexOf('\n');
  }
  return rest;
}
