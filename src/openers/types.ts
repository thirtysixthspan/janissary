import type { ImageView, MarkdownView, PageView } from '../types.js';

// Capabilities an opener may use, supplied by the dispatcher (the Controller). Kept deliberately
// narrow so an opener can only do the two things its surfaces promise — launch an external viewer
// or mount an in-app view — and never reaches into controller internals. This is what keeps the
// dispatcher closed for modification while the opener registry stays open for extension.
export type OpenContext = {
  // Append a confirmation/error line to the originating tab's transcript.
  note: (text: string) => void;
  // Create and focus an in-app image view tab.
  openImageTab: (image: ImageView) => void;
  // Create and focus an in-app markdown view tab.
  openMarkdownTab: (view: MarkdownView) => void;
  // Create and focus an in-app embedded web page tab.
  openPageTab: (view: Pick<PageView, 'url' | 'domain'>) => void;
  // Register a local file to be served to the web client; returns the app-relative ref to load it.
  registerFile: (absPath: string) => string;
  // Hand a file to the operating system's default viewer (detached). Returns false when no viewer
  // could be launched on this platform.
  openExternally: (absPath: string) => boolean;
};

// An opener handles one family of file types. Supporting a new type means registering one new
// opener (in `src/openers/index.ts`) — nothing else changes.
export interface Opener {
  // Identifier for the opener (e.g. 'image').
  name: string;
  // The file extensions this opener claims, lowercased and dot-prefixed (e.g. '.png').
  extensions: string[];
  // Hand the file to a program outside the app.
  external: (file: string, context: OpenContext) => void | Promise<void>;
  // Perform an in-app UI action for the file (e.g. open a tab).
  inline: (file: string, context: OpenContext) => void | Promise<void>;
}
