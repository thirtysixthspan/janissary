import { useCallback, useEffect, useRef, useState } from 'react';
import { CastStream, type CastEvent, type CastHeader } from './cast-stream';

// How often a visible tab asks for the recording's tail. A `setTimeout` chain rather than an
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
// Whether the session is still running is a separate question from whether bytes arrived, and only the
// host can answer it — see `liveAtOpen` and `askLive` below. The two effects here are split by how
// often each thing changes: the served reference changes once, when the tab opens, and owns the parser,
// the offset, the one whole-file read, and the liveness latch; visibility changes every time the user
// switches tabs, and owns only the poll chain — so hiding the tab costs one timer, and showing it again
// resumes from where the reading got to instead of fetching the whole recording a second time.
export type AsciicastSource = {
  header: CastHeader | undefined;
  events: readonly CastEvent[];
  error: string | undefined;
  // How the session ended, when the recording says. A recording ended by closing its tab never does,
  // which is one of the two things that tell a finished recording from a live one.
  exitStatus?: number;
  // Whether the session that was writing this recording is still running. Not the same question as
  // whether the last poll found bytes: a session between two prompts produces none for as long as the
  // user takes to type the next one, and it is still running.
  live: boolean;
};

// What the hook needs to know about the tab's recording: where to read it, whether it is on screen,
// the host's answer about its session at the moment the tab opened, and how to ask again.
export type AsciicastSourceOptions = {
  url: string | undefined;
  active: boolean;
  liveAtOpen: boolean;
  askLive(): Promise<boolean>;
};

const EMPTY: AsciicastSource = {
  header: undefined,
  events: [],
  error: undefined,
  exitStatus: undefined,
  live: false,
};

export function useAsciicastSource({
  url, active, liveAtOpen, askLive,
}: AsciicastSourceOptions): AsciicastSource {
  const [source, setSource] = useState<AsciicastSource>(EMPTY);
  // The parser and the offset outlive a render so a poll answers into the same stream the first read
  // built, rather than re-parsing from the beginning on every tick.
  const stream = useRef(new CastStream());
  const offset = useRef(0);
  // A streaming decoder holds back an incomplete UTF-8 sequence at the end of a chunk, so a chunk
  // boundary landing inside a multi-byte character cannot corrupt the line that follows it.
  const decoder = useRef(new TextDecoder());
  const failure = useRef<string | undefined>(undefined);
  // Liveness is a latch, not a poll result: a session cannot resume writing a recording the host has
  // stopped watching, so this only ever goes from true to false.
  const live = useRef(liveAtOpen);
  live.current &&= liveAtOpen;
  // The capability is rebuilt every render, so it is read through a ref like the tab's visibility is:
  // the poll chain must not be torn down and restarted by a new closure.
  const ask = useRef(askLive);
  ask.current = askLive;

  const publish = useCallback(() => setSource({
    header: stream.current.header,
    events: stream.current.events,
    // A file that could not be fetched outranks one that could not be parsed, since the parse reason
    // is usually a consequence of an empty or truncated read.
    error: failure.current ?? stream.current.error,
    exitStatus: stream.current.exitStatus,
    // The file's own exit event ends the session without consulting anybody, so a session that exits
    // on its own needs no question asked.
    live: live.current && stream.current.exitStatus === undefined,
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
    live.current = liveAtOpen;
    if (!url) { setSource(EMPTY); return; }
    void read(0).then(() => {
      if (!failure.current) publish();
    }).catch(() => {
      failure.current = 'the recording could not be read';
      publish();
    });
  }, [url, liveAtOpen, read, publish]);

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
        publish();
        return;
      }
      // Bytes arriving prove the session is running. Their absence proves nothing — a session between
      // two prompts looks exactly like one that has ended — so that is the one case worth a question,
      // and asking it is what keeps a quiet live recording badged and holding at its end.
      if (!grew && live.current) {
        try {
          live.current = await ask.current();
        } catch {
          // A host that did not answer is not a host that said no: a recording still being written
          // must not be declared finished because the question could not be delivered.
        }
      }
      publish();
      if (!cancelled) timer = setTimeout(() => { void poll(); }, POLL_MS);
    };
    timer = setTimeout(() => { void poll(); }, POLL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [url, active, read, publish]);

  return source;
}