import { useCallback, useState } from 'react';

interface FrameState {
  url: string;
  src: string;
  generation: number;
}

// What the embedded frame is loaded with, and the key that decides when it is replaced. An address
// the frame reported about itself (through `followFrame`) leaves the frame where it is: it is already
// showing that page, and a fresh frame would throw away the history back and forward step through.
// Any other change of address, such as one typed into the header, loads into a fresh frame, and so
// does a reload, at whatever address the tab is on now.
export function usePageFrame(url: string) {
  const [reported, setReported] = useState(url);
  const [frame, setFrame] = useState<FrameState>({ url, src: url, generation: 0 });
  if (frame.url !== url) {
    setFrame(url === reported
      ? { ...frame, url }
      : { url, src: url, generation: frame.generation + 1 });
  }
  const reload = useCallback(() => {
    setFrame((current) => ({ url: current.url, src: current.url, generation: current.generation + 1 }));
  }, []);
  return { src: frame.src, key: frame.generation, reload, followFrame: setReported };
}
