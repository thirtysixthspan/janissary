// Whether `text`, laid out on its own, would not fit in one visual row of `element` — meaning the
// browser is guaranteed to have wrapped it onto at least one more row. Raw unwrapped width can
// only be less than or equal to what word-wrap actually renders, so this holds regardless of
// exactly where the browser breaks the line; no DOM mirror element is needed for an exact answer.
// Only ever called from an ArrowUp/ArrowDown keypress, so a fresh canvas per call costs nothing
// worth caching.
export function wrapsWithinRow(element: HTMLTextAreaElement, text: string): boolean {
  const measureContext = document.createElement('canvas').getContext('2d');
  if (!measureContext) return false;
  const style = getComputedStyle(element);
  measureContext.font = `${style.fontSize} ${style.fontFamily}`;
  return measureContext.measureText(text).width > element.clientWidth;
}
