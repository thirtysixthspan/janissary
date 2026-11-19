export type PlacementRect = { top: number; right: number; bottom: number; left: number };

export function listPlacement(
  input: PlacementRect,
  box: PlacementRect,
  listHeight: number,
): { above: boolean; maxWidth: number } {
  return {
    above: input.bottom + listHeight > box.bottom,
    maxWidth: box.right - input.left,
  };
}

export function scrollBox(list: HTMLElement): PlacementRect {
  let element = list.parentElement;
  while (element && element !== document.body) {
    if (getComputedStyle(element).overflowY !== 'visible') {
      const rect = element.getBoundingClientRect();
      const top = rect.top + element.clientTop;
      const left = rect.left + element.clientLeft;
      return {
        top,
        left,
        bottom: top + element.clientHeight,
        right: left + element.clientWidth,
      };
    }
    element = element.parentElement;
  }
  return {
    top: 0,
    left: 0,
    bottom: window.innerHeight,
    right: window.innerWidth,
  };
}
