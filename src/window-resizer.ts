type WindowResizer = (width: number, height: number) => Promise<void>;

let resizer: WindowResizer | undefined;

// In-process registry so profile-launch code (src/profile/layout.ts) can request an app window
// resize without importing main.ts, which sits above the server in the dependency graph.
export function setWindowResizer(fn: WindowResizer | undefined): void {
  resizer = fn;
}

export function getWindowResizer(): WindowResizer | undefined {
  return resizer;
}
