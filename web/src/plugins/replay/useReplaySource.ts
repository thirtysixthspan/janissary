import { useCallback, useEffect, useRef, useState } from 'react';
import { CastStream, type CastEvent, type CastHeader } from './cast-stream';

// How often a visible replay asks for the recording's tail. A `setTimeout` chain rather than an
// interval, so a slow response can never overlap the next one and the poll interval starts again
// only once this one has been read.
export const POLL_MS = 750;

// Reading the recording off the tab's own served reference, and keeping reading it while the session
// that is writing it is still running.
//
// The whole file first, then only what has been appended since, by asking for the bytes from the
// last one read. That is the `/open/` route's own range support doing the work — no server change, and
// a long recording is read once rather than re-fetched. A request for a window at or past the end
// comes back `416`, which is not a failure but the ordinary answer to a question whose answer is
// "nothing new", and a poll that finds no bytes is not a reason to stop: a session that is quiet for
// minutes and then speaks again is still followed.
//
// Two effects rather than one, because two different things change here and only one of them is rare.
// The served reference changes once, when the tab opens, and owns the parser, the offset, and the one
// whole-file read. Visibility changes every time the user switches tabs, and owns only the poll chain
// — so hiding a replay costs one timer, and showing it again resumes from where the reading got to
// instead of fetching the whole recording a second time.
export type ReplaySource = {
  header: CastHeader | undefined;
  events: readonly CastEvent[];
  error: string | undefined;
  // How the session ended, when the recording says. A recording ended by closing its tab never does,
  // which is one of the two things that tell a finished recording from a live one.
  exitStatus?: number;
  // Whether the most recent poll brought anything new, which is what the live badge reports.
  growing: boolean;
  // The length of the recording as written, before idle compression.
  recorded: number;
};

const EMPTY: ReplaySource = {
  header: undefined,
  events: [],
  error: undefined,
  exitStatus: undefined,
  growing: false,
  recorded: 0,
};

export function useReplaySource(url: string | undefined, active: boolean): ReplaySource {
  const [source, setSource] = useState<ReplaySource>(EMPTY);
  // The parser and the offset outlive a render so a poll answers into the same stream the first read
  // built, rather than re-parsing from the beginning on every tick.
  const stream = useRef(new CastStream());
  const offset = useRef(0);
  // A streaming decoder holds back an incomplete UTF-8 sequence at the end of a chunk, so a chunk
  // boundary landing inside a multi-byte character cannot corrupt the line that follows it.
  const decoder = useRef(new TextDecoder());
  const failure = useRef<string | undefined>(undefined);

  const publish = useCallback((growing: boolean) => setSource({
    header: stream.current.header,
    events: stream.current.events,
    // A file that could not be fetched outranks one that could not be parsed, since the parse reason
    // is usually a consequence of an empty or truncated read.
    error: failure.current ?? stream.current.error,
    exitStatus: stream.current.exitStatus,
    growing,
    recorded: stream.current.duration,
  }), []);

  const read = useCallback(async (from: number): Promise<boolean> => {
    if (!url) return false;
    const response = await fetch(url, from === 0
      ? { cache: 'no-store' }
      : { headers: { Range: `bytes=${from}-` }, cache: 'no-store' });
    if (response.status === 416) return false;
    const body = await response.arrayBuffer();
    if (body.byteLength === 0) return false;
    offset.current = from + body.byteLength;
    stream.current.push(decoder.current.decode(body, { stream: true }));
    return true;
  }, [url]);

  // The one whole-file read, and the reset of everything a new recording needs. Keyed on the served
  // reference alone: a change of visibility must not throw away the reading already done.
  useEffect(() => {
    stream.current = new CastStream();
    offset.current = 0;
    decoder.current = new TextDecoder();
    failure.current = undefined;
    if (!url) { setSource(EMPTY); return; }
    void read(0).then((grew) => {
      if (!failure.current) publish(grew);
    }).catch(() => {
      failure.current = 'the recording could not be read';
      publish(false);
    });
  }, [url, read, publish]);

  // The poll chain, keyed on visibility alone. Each chain carries its own flag, so a cleanup can only
  // stop the chain that effect started and never the one that replaced it.
  useEffect(() => {
    if (!url || !active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      let grew: boolean;
      try {
        grew = await read(offset.current);
      } catch {
        failure.current = 'the recording could not be read';
        publish(false);
        return;
      }
      publish(grew);
      if (!cancelled) timer = setTimeout(() => { void poll(); }, POLL_MS);
    };
    timer = setTimeout(() => { void poll(); }, POLL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [url, active, read, publish]);

  return source;
}