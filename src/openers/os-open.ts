import { spawn } from 'node:child_process';

// Hand a file to the operating system's default application, launched detached so it never blocks
// the app's event loop (the same pattern as `browser shot` in src/browser.ts). Spawn errors are
// swallowed — a missing opener must not crash the app. Returns false on a platform with no known
// opener so the caller can fall back to reporting the path.
//
// `application` names a specific macOS application to launch the file with (the `open -a` flag),
// e.g. the player configured for the `video` opener. It is ignored on every other platform, where
// there is no equivalent one-flag form; callers that care retry without it (see the video plugin).
export function didOsOpen(path: string, application?: string): boolean {
  const command = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : process.platform === 'linux' ? 'xdg-open'
    : undefined;
  if (!command) return false;
  if (application && process.platform !== 'darwin') return false;
  // `start` is a cmd.exe builtin; the empty title arg avoids it consuming a quoted path as the title.
  const arguments_ = command === 'start' ? ['', path]
    : application ? ['-a', application, path]
    : [path];
  try {
    const child = spawn(command, arguments_, { stdio: 'ignore', detached: true, shell: command === 'start' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
