export function isProgrammaticScroll(scrollTop: number, lastWrittenTop: number): boolean {
  return Math.abs(scrollTop - lastWrittenTop) < 1;
}

export function isWithinBottomFollowThreshold(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
): boolean {
  return scrollHeight - scrollTop - clientHeight < 40;
}
