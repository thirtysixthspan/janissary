import { spawn } from 'node:child_process';

// Hand a file to the operating system's default application, launched detached so it never blocks
// the app's event loop (the same pattern as `browser shot` in src/browser.ts). Spawn errors are
// swallowed — a missing opener must not crash the app. Returns false on a platform with no known
// opener so the caller can fall back to reporting the path.
export function didOsOpen(path: string): boolean {
  const command = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : process.platform === 'linux' ? 'xdg-open'
    : undefined;
  if (!command) return false;
  // `start` is a cmd.exe builtin; the empty title arg avoids it consuming a quoted path as the title.
  const arguments_ = command === 'start' ? ['', path] : [path];
  try {
    const child = spawn(command, arguments_, { stdio: 'ignore', detached: true, shell: command === 'start' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
