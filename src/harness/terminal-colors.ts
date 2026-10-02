// The two terminal colors a recording carries, and the one place that decides what a valid one is.
// The client sends what its terminal surface actually resolved, because the values live only in
// `web/src/theme.css` under each `[data-theme]` block and the server holds nothing but the theme's
// name — so a replay would otherwise be rendered under whatever theme is active when it is watched
// rather than the one the session ran under.
export type TerminalColors = {
  fg: string;
  bg: string;
};

// Deliberately narrow. A CSS color string is not a CSS color string to this server: what arrives is
// untrusted input that ends up written into a recording's header and handed to a terminal emulator,
// and a value that is not a plain hex color is not worth forwarding. Three to eight digits of `#`
// followed by hex, which is what `getComputedStyle` returns for a custom property the app defines.
export function isTerminalColors(value: unknown): value is TerminalColors {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const colors = value as Record<string, unknown>;
  return isHexColor(colors.fg) && isHexColor(colors.bg);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu
    .test(value.trim());
}
