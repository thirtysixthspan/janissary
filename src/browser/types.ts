export type BrowserWindow = {
  id: string;
  // Navigate to a URL (waits for load); returns a short "title — url" summary.
  goto: (url: string) => Promise<string>;
  // Run JavaScript in the page and return the (JSON-stringified) result.
  eval: (js: string) => Promise<string>;
  // Screenshot the viewport to a temp PNG and (on macOS) open it in Preview; returns the path.
  shot: () => Promise<string>;
  // The page's rendered text (title + body innerText), truncated for agent consumption.
  content: () => Promise<string>;
  // Current page URL, for `connection list` display.
  url: () => string;
};

export type TabBrowser = {
  mode: 'headless' | 'headed';
  openWindow: (id: string) => Promise<BrowserWindow>;
  window: (id: string) => BrowserWindow | undefined;
  closeWindow: (id: string) => Promise<void>;
  windowIds: () => string[];
  close: () => Promise<void>;
};

export type BrowserParsed =
  | { error: string }
  | { action: 'open'; name?: string; headed: boolean }
  | { action: 'list' }
  | { action: 'use'; id: string }
  | { action: 'goto'; url: string }
  | { action: 'eval'; js: string }
  | { action: 'shot' }
  | { action: 'content' }
  | { action: 'close' }
  | { action: 'closeWindow'; id: string };
