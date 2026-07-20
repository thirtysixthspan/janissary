type WindowResizer = (width: number, height: number) => Promise<void>;
type WindowBoundsReader = () => Promise<{ width: number; height: number }>;

let resizer: WindowResizer | undefined;
let boundsReader: WindowBoundsReader | undefined;

// In-process registry so profile-launch code (src/profile/layout.ts) can request an app window
// resize without importing main.ts, which sits above the server in the dependency graph.
export function setWindowResizer(fn: WindowResizer | undefined): void {
  resizer = fn;
}

export function getWindowResizer(): WindowResizer | undefined {
  return resizer;
}

// Companion registry for reading the app window's current size (`profile save`'s `_layout.json`
// capture). Registered alongside the resizer, so it too is absent under `--no-open`.
export function setWindowBoundsReader(fn: WindowBoundsReader | undefined): void {
  boundsReader = fn;
}

export function getWindowBoundsReader(): WindowBoundsReader | undefined {
  return boundsReader;
}
