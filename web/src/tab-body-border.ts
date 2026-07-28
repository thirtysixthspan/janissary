export function tabBodyBorder(dotColor: string, focused: boolean): string {
  return `4px solid ${focused ? dotColor : 'var(--muted)'}`;
}
