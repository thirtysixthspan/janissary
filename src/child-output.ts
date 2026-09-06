import type { Readable } from 'node:stream';

// A bounded tail of what a spawned child said on its own output streams, so a failure can be
// reported in the child's words rather than as the bare fact that it failed. Janissary spawns a
// harness into a sandbox (`src/acp/index.ts`) and a browser into another
// (`src/browser/e2e-server.ts`), and neither has a terminal to write to — without this their
// diagnostics go nowhere and the tab that started them learns only that the thing exited.
//
// Attaching a reader also drains the pipe, which is the second reason this exists: a piped stream
// nobody reads fills its buffer and blocks the child on its next write.

// Two bounds rather than one. The character cap keeps a child that spews before dying from putting
// an unbounded string into a transcript entry; the line cap keeps that entry readable when the last
// couple of thousand characters happen to be a stack trace.
const TAIL_CHARACTERS = 2000;
const TAIL_LINES = 10;

export type ChildOutputTail = {
  // Start capturing a stream. Takes the `null` a child exposes for a stdio slot it was not given, so
  // a caller never has to branch on which slots it piped.
  watch: (stream: Readable | null | undefined) => void;
  // What has been captured, bounded to the newest and trimmed. Takes whatever each watched stream is
  // already holding first, so a message composed inside an `exit` handler still carries output that
  // landed in the same tick.
  text: () => string;
};

export function childOutputTail(): ChildOutputTail {
  const streams: Readable[] = [];
  let captured = '';

  // `read()` is typed as `any`, so the chunk is taken as `unknown` and narrowed — an encoded stream
  // yields strings and yields `null` when it has nothing, which is the loop's exit.
  function drain(stream: Readable): void {
    let chunk: unknown = stream.read();
    while (typeof chunk === 'string') {
      captured = (captured + chunk).slice(-TAIL_CHARACTERS);
      chunk = stream.read();
    }
  }

  return {
    watch: (stream) => {
      if (!stream) return;
      streams.push(stream);
      // Let the stream decode: a multi-byte character split across two reads is its problem, and it
      // already knows how to hold the partial one back.
      stream.setEncoding('utf8');
      // `readable` + `read()` rather than `data`, because `text()` has to be able to take the last of
      // it synchronously. A `data` handler can only ever deliver on a later tick, which is too late
      // for a message being composed right now.
      stream.on('readable', () => drain(stream));
      // A broken pipe contributes nothing, and an unhandled `error` event would throw — on a path
      // whose entire job is reporting some other failure.
      stream.on('error', () => { /* nothing to add */ });
    },
    text: () => {
      for (const stream of streams) drain(stream);
      return lastLines(captured.trim());
    },
  };
}

function lastLines(text: string): string {
  if (!text) return '';
  return text.split('\n').slice(-TAIL_LINES).join('\n');
}

/**
 * `message` with the child's own output beneath it, or `message` alone when the child said nothing.
 * Every caller composes its failure text through this, so a silent child still produces exactly the
 * message it produced before any of this existed.
 */
export function withChildOutput(message: string, tail: string): string {
  return tail ? `${message}\n${tail}` : message;
}
