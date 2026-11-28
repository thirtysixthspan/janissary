// The smallest equal percentage of a layer's width and height at which the question panel's content
// fits without scrolling. The caller supplies how tall the content is at a candidate width so this
// search stays pure and free of DOM reads.
export function fitPanelPercent(
  layerWidth: number,
  layerHeight: number,
  contentHeightAtWidth: (width: number) => number,
): number {
  for (let percent = 1; percent <= 90; percent++) {
    const width = layerWidth * percent / 100;
    const height = layerHeight * percent / 100;
    if (contentHeightAtWidth(width) <= height) return percent;
  }
  return 90;
}
