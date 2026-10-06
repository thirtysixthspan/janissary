// The terminal colors a recording carries, and the one place that decides what a valid one is.
// The client sends what its terminal surface actually resolved, because the values live only in
// `web/src/theme.css` under each `[data-theme]` block and the server holds nothing but a theme's
// name — so a replay would otherwise be rendered under whatever theme is active when it is watched
// rather than the one the session ran under.
export type TerminalColors = {
  fg: string;
  bg: string;
  // The 16 ANSI colors, in ANSI order, for the asciicast v3 `term.theme.palette` field. Optional:
  // a client that reports only `fg`/`bg` still validates, and its recording keeps the two-key theme
  // it always had rather than a partial palette.
  palette?: readonly string[];
};

// Deliberately narrow. A CSS color string is not a CSS color string to this server: what arrives is
// untrusted input that ends up written into a recording's header and handed to a terminal emulator,
// and a value that is not a plain hex color is not worth forwarding. Three to eight digits of `#`
// followed by hex, which is what `getComputedStyle` returns for a custom property the app defines.
export function isTerminalColors(value: unknown): value is TerminalColors {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const colors = value as Record<string, unknown>;
  if (!isHexColor(colors.fg) || !isHexColor(colors.bg)) return false;
  if (colors.palette === undefined) return true;
  return isPalette(colors.palette);
}

// Exactly 16 or nothing: the field is written into a header as one colon-joined list, and a list of
// the wrong length would put a palette in the file that no player's palette table could index. A
// palette is refused rather than padded or truncated, because a recording whose header disagrees
// with its own contents is worse than one that records no palette at all.
export function isPalette(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length === 16 && value.every((color) => isHexColor(color));
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu
    .test(value.trim());
}