import { useEffect, useRef, useState } from 'react';
import { AsciicastReader, EMPTY_SOURCE, type AsciicastSource } from './source-reader';

export type AsciicastSourceOptions = {
  url: string | undefined;
  active: boolean;
  liveAtOpen: boolean;
  askLive(): Promise<boolean>;
};

export function useAsciicastSource(options: AsciicastSourceOptions): AsciicastSource {
  const { url, active, liveAtOpen } = options;
  const [source, setSource] = useState<AsciicastSource>(EMPTY_SOURCE);
  const reader = useRef<AsciicastReader | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!url) { setSource(EMPTY_SOURCE); return; }
    const current = new AsciicastReader(url, latest.current.liveAtOpen, () => latest.current.askLive(), setSource);
    reader.current = current;
    current.start(latest.current.active);
    return () => { current.dispose(); reader.current = null; };
  }, [url]);

  useEffect(() => { reader.current?.setActive(active); }, [active]);
  useEffect(() => { reader.current?.setLive(liveAtOpen); }, [liveAtOpen]);

  return source;
}
