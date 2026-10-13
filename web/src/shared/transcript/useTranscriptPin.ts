import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { BufferLine } from '@shared/protocol';
import { isProgrammaticScroll, isWithinBottomFollowThreshold } from '../scroll-follow';
import type { LineHighlight } from './line-text';

type Properties = {
  lines: BufferLine[];
  highlight?: LineHighlight;
  pinToBottom: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
};

export function useTranscriptPin({ lines, highlight, pinToBottom, scrollRef }: Properties) {
  const stick = useRef(true);
  const lastTop = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const pin = useCallback(() => {
    if (!pinToBottom) return;
    const element = scrollRef.current;
    if (!element || !stick.current || highlight) return;
    element.scrollTop = element.scrollHeight;
    lastTop.current = element.scrollTop;
  }, [scrollRef, highlight, pinToBottom]);

  useEffect(() => { pin(); }, [lines, pin]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => pin());
    observer.observe(content);
    return () => observer.disconnect();
  }, [pin]);

  useEffect(() => {
    if (!highlight) return;
    const element = scrollRef.current;
    const hitElement = element?.querySelector('[data-search-hit]');
    if (!element || !hitElement) return;
    const target = (hitElement as HTMLElement).offsetTop - element.clientHeight + 2 * 22;
    element.scrollTop = Math.max(0, target);
  }, [highlight, lines, scrollRef]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element || isProgrammaticScroll(element.scrollTop, lastTop.current)) return;
    lastTop.current = element.scrollTop;
    stick.current = isWithinBottomFollowThreshold(element.scrollHeight, element.scrollTop, element.clientHeight);
  }, [scrollRef]);

  return { contentRef, onScroll };
}
