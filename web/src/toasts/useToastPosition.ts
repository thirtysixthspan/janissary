import { useEffect, useState } from 'react';

const TOAST_GAP_PX = 8;
const MIN_TOAST_TOP_PX = 40;
const STATUS_OBSTACLES = '.connection-status, .status-panels .panel';

function visibleBottom(root: ParentNode): number {
  let bottom = MIN_TOAST_TOP_PX - TOAST_GAP_PX;
  for (const element of root.querySelectorAll<HTMLElement>(STATUS_OBSTACLES)) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    bottom = Math.max(bottom, element.getBoundingClientRect().bottom);
  }
  return bottom;
}

export function useToastPosition(): number {
  const [top, setTop] = useState(MIN_TOAST_TOP_PX);

  useEffect(() => {
    const root = document.querySelector('.app') ?? document.body;
    const measure = () => setTop(Math.max(MIN_TOAST_TOP_PX, Math.ceil(visibleBottom(root) + TOAST_GAP_PX)));
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    const observe = () => {
      for (const element of root.querySelectorAll(STATUS_OBSTACLES)) resizeObserver?.observe(element);
    };
    const mutations = new MutationObserver(() => { observe(); measure(); });
    mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', measure);
    observe();
    measure();
    return () => {
      mutations.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return top;
}
