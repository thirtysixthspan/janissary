// The extension set behind the file navigator's whole-selection Open/Edit fan-out. The client host
// may not runtime-import the image plugin's shared contract — the plugin import boundaries keep
// plugin guards out of the entry bundle — so the list lives here as host-owned data, the same trade
// `web/src/plugins/registry.tsx` makes for schema literals. `multi-open.test.ts` pins this set
// against the image manifest's declared `fileExtensions` keys so drift fails a test loudly.
const MULTI_OPEN_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico',
]);

function isMultiOpenablePath(value: string): boolean {
  return MULTI_OPEN_EXTENSIONS.has(value.slice(value.lastIndexOf('.')).toLowerCase());
}

// The selection Open and Edit should fan out over when a row inside a multi-row selection is
// activated: every selected path when all of them qualify, `null` for anything else — single rows
// and mixed selections keep the normal single-row behavior.
export function multiOpenablePaths(paths: string[]): string[] | null {
  return paths.length > 1 && paths.every((value) => isMultiOpenablePath(value)) ? paths : null;
}
